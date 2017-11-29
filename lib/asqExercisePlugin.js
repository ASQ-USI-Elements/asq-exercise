const ASQPlugin = require('asq-plugin');
const ObjectId = require('bson-objectid');
const Promise = require('bluebird');

const coroutine = Promise.coroutine;
const cheerio = require('cheerio');
const _ = require('lodash');


// http://www.w3.org/html/wg/drafts/html/master/infrastructure.html#boolean-attributes
function getBooleanValOfBooleanAttr(attrName, attrValue) {
  if (attrValue === '' || attrValue === attrName) {
    return true;
  }
  return false;
}

function getArrayValOfCommaSeperatedAttr(attrValue) {
  if (!attrValue) return [];
  return (attrValue).replace(/\s/g, '').split(',');
}

module.exports = ASQPlugin.extend({

  tagName: 'asq-exercise',

  hooks: {
    'parse_html': 'parseHtml',

    'exercise_submission': 'exerciseSubmission',

    'udpate_exercise_settings': 'updateExerciseSettings',
    'presenter_connected': 'presenterConnected',
    'viewer_connected': 'viewerConnected',
  },


  mixinSettings: function(des, src) {
    for (let i = 0; i < des.length; i++) {
      const key = des[i].key;
      if (src.hasOwnProperty(key)) {
        des[i].value = src[key];
      }
    }
  },


  updateExerciseSettingsDB: coroutine(function* updateExerciseSettingsDBGen(exerciseId, settings) {
    const exercise = yield this.asq.db.model('Exercise')
      .findById(exerciseId)
      .exec();
    const currentSettings = exercise.listSettings();
    this.mixinSettings(currentSettings, settings);
    yield exercise.updateSettings(currentSettings);
  }),

  updateExerciseSettingsDust: function(exerciseId, settings, html) {
    const oldSettings = this.parseExerciseSettingsGivenId(html);
    const keys = Object.getOwnPropertyNames(settings);
    for (let i in keys) {
      const key = keys[i];
      oldSettings[key] = settings[key];
    }
    return this.writeSettingsAsAttributesToGivenExercise(html, exerciseId, oldSettings);
  },

  updateExerciseSettings: coroutine(function* updateExerciseSettingsGen(option) {
    const exercise = yield this.asq.db.model('Exercise')
      .findById(option.exercise_id)
      .exec();
    if (!exercise) throw new Error('Cannot find exercise.');

    let modifiedHtml = option.html;
    try {
      yield this.updateExerciseSettingsDB(option.exercise_id, option.settings);
      modifiedHtml = this.updateExerciseSettingsDust(option.exercise_id, option.settings, option.html);
      return {
        exerciseId: option.exercise_id,
        html: modifiedHtml,
        settings: option.settings,
        status: 'success',
      };
    } catch (e) {
      console.log(e);
      return {
        exerciseId: option.exercise_id,
        html: modifiedHtml,
        settings: option.settings,
        status: 'failed',
      };
    }
  }),

  // TODO merge this function with writeSettings
  writeSettingsAsAttributesToGivenExercise: function(html, exerciseId, settings) {
    const $ = cheerio.load(html, {
      decodeEntities: false,
      lowerCaseAttributeNames: false,
      lowerCaseTags: false,
      recognizeSelfClosing: true,
    });

    const lSettings = this._convertSettings2CheerioCompatible(this.camel2dashed(settings));
    const query = this.tagName + '[uid=' + exerciseId + ']';
    $(query).attr(lSettings);

    return $.root().html();
  },

  _convertSettings2CheerioCompatible(settings) {
    Object.keys(settings).forEach(function (key) {
      if (settings[key] === false) {
        // cheerio will coerce boolean to String for custom
        // attributes https://github.com/cheeriojs/cheerio/pull/249
        delete settings[key];
      } else if (settings[key] === true) {
        settings[key] = key;
      }
    });

    return settings;
  },

  writeSettings: function($el, settings) {
    let objSettings = {};
    settings.forEach(function(setting, index) {
      objSettings[setting.key] = setting.value;
    });

    const dashedSettings = this.camel2dashed(objSettings);
    const lSettings = this._convertSettings2CheerioCompatible(dashedSettings);
    $el.attr(lSettings);
  },

  parseHtml: coroutine(function* parseHtmlGen(options) {
    const questionElementNames = options.questionElementNames;
    const $ = cheerio.load(options.html, {
      decodeEntities: false,
      lowerCaseAttributeNames: false,
      lowerCaseTags: false,
      recognizeSelfClosing: true,
    });

    const slideshow = yield this.asq.db.model('Slideshow')
      .findById(options.slideshow_id)
      .exec();
    const presentationSettings = slideshow.listSettings();

    const flatten = {};
    _.clone(presentationSettings).forEach(function (setting) {
      flatten[setting.key] = setting.value;
    });

    const exerciseEls = $(this.tagName).toArray();
    for ( let i in exerciseEls ) {
      const el = exerciseEls[i];
      const r = this.processEl($, el, questionElementNames);
      const exercise = yield this.createNewExercise(r._id, r.stem, r.questions, r.assessmentTypes);
      const exSettings = this.parseExerciseSettings($, el);
      const exerciseSettings = this.createExerciseSettings(exSettings, presentationSettings);

      let attempts = 2;
      while (attempts > 0) {
        try {
          --attempts;
          yield exercise.updateSettings(exerciseSettings);
          attempts = -1;
        } catch (e) {
          if (e.errorType !== 'InvalidSettingError') {
            throw e;
          }
          console.log('Failed to update settings.', e.message);
          for (let i in exerciseSettings) {
            if (exerciseSettings[i].key === e.key) {
              exerciseSettings[i].value = flatten[e.key];
            }
          }
        }
      }

      this.writeSettings($(el), exerciseSettings);
    }

    options.html = $.root().html();
    return options;
  }),

  /**
   * Priorities: lowest index with highest priority.
   *
   * 1. Exercise-level-user-defined
   * 2. Presentation-level
   * 3. Exercise-defalut
   *
   * @method createExerciseSettings
   * @return exercise-settings
   */
  createExerciseSettings: function(exerciseSettings, presentationSettings) {
    const flattenSettings = {};
    presentationSettings.forEach(function(s, index) {
      flattenSettings[s.key] = s.value;
    });

    const defaultExSettings = this.asq.api.settings.defaultSettings['exercise'];

    for (let i in defaultExSettings) {
      let key = defaultExSettings[i].key;
      if (exerciseSettings.hasOwnProperty(key)) {
        defaultExSettings[i].value = exerciseSettings[key];
      } else if (flattenSettings.hasOwnProperty(key)) {
        defaultExSettings[i].value = flattenSettings[key];
      }
    }
    return defaultExSettings;
  },


  createNewExercise: coroutine(function* createBlankSlideshowGen(_id, stem, questions, assessmentTypes) {
    const settings = this.asq.api.settings.defaultSettings['exercise'];
    const exercise = yield this.asq.db.model('Exercise').create({
      _id,
      stem,
      questions,
      settings,
    });
    return exercise;
  }),

  parseExerciseSettingsGivenId: function (html, exerciseId) {
    const $ = cheerio.load(html, {
      decodeEntities: false,
      lowerCaseAttributeNames: false,
      lowerCaseTags: false,
      recognizeSelfClosing: true,
    });
    const query = this.tagName + '[uid=' + exerciseId + ']';
    if (!$(query).length) return {};

    const $el = $(query);
    this._fixBooleanAttributesFromCheerio($el);

    const attr = this._assureBooleanValFromHTMLBooleanAttr($el.attr());

    return this.dashed2Camel(attr);
  },

  /*
  * boolean attributes in HTML can have no value,
  * or have as value the attribute names. Cheerio
  * messes up the first category, reporting them
  * as having an empty string for value.
  * This function fixes that.
  */
  _fixBooleanAttributesFromCheerio: function ($el) {
    if (!$el) {
      throw new Error('expected `$el` to exist');
    }

    const attr = $el.attr();

    ['disabled', 'confidence'].forEach(function (key) {
      if (attr.hasOwnProperty(key)) {
        $el.attr(key, key);
      }
    });

    return $el;
  },

  /*
  * If HTML boolean attributes have as value the attribute name,
  * cast them to boolean.
  */
  _assureBooleanValFromHTMLBooleanAttr: function (attr) {
    if (!_.isObjectLike(attr)) {
      throw new Error('expected `attr` to be Object-like');
    }

    ['disabled', 'confidence'].forEach(function (key) {
      if (attr.hasOwnProperty(key)
        && (attr[key] === key || attr[key] === true)) {
        attr[key] = true;
      }
    });

    return attr;
  },

  dashed2Camel: function (attr) {
    const lAttr = _.clone(attr);
    Object.keys(lAttr).forEach(function(key, index) {
      if (key.indexOf('-') >= 0) {
        const value = lAttr[key];
        delete lAttr[key];
        const camelCased = key.replace(/-([a-z])/g, function (g) {
          return g[1].toUpperCase();
        });
        lAttr[camelCased] = value;
      }
    });
    return lAttr;
  },

  camel2dashed: function (attr) {
    const lAttr = _.clone(attr);
    Object.keys(lAttr).forEach(function(key, index) {
      const value = lAttr[key];
      delete lAttr[key];
      const dashed = key.replace(/([A-Z])/g, function($1) {
        return '-'+$1.toLowerCase();
      });
      lAttr[dashed] = value;
    });
    return lAttr;
  },

  parseExerciseSettings: function($, el) {
    const $el = $(el);
    this._fixBooleanAttributesFromCheerio($el);
    const attr = this._assureBooleanValFromHTMLBooleanAttr($el.attr());

    return this.dashed2Camel(attr);
  },

  processEl: function ($, el, questionElementNames) {
    // make sure exercise has a unique id
    const $el = $(el);
    let uid = $el.attr('uid');
    if (uid === undefined || uid.trim() === '') {
      $el.attr('uid', uid = ObjectId().toString());
    }

    // get stem
    let stem = $el.find('asq-stem');
    if (stem.length) {
      stem = stem.eq(0).html();
    } else {
      stem = '';
    }
    const elAttr = $el.attr('assessment');
    const assessmentTypes = getArrayValOfCommaSeperatedAttr(elAttr);
    const questionIds = this.parseQuestions($, el, questionElementNames);
    return {
      _id: uid,
      stem,
      questions: questionIds,
      assessmentTypes,
    };
  },

  // TODO: avoid hardcode
  parseQuestions: function ($, el, questionElementNames) {
    const ids = Object.create(null);
    const $el = $(el);

    questionElementNames.forEach(function eachTagName(tagName) {
      $el.find(tagName).each(function eachTagNameEl(idx, el) {
        const $el = $(el);
        let uid = $el.attr('uid');
        if (uid === undefined || uid.trim() === '') {
          $el.attr('uid', uid = ObjectId().toString());
        }
        if (ids[uid]) {
          throw new Error('An exercise cannot have two questions with the same uids');
        }
        ids[uid] = true;
      });
    });

    return Object.keys(ids);
  },

  restorePresenterForSession: coroutine(function* restorePresenterForSessionGen(sessionId) {
    const pipeline = [
      {
        $match: {
          session: sessionId,
        },
      },
      { $sort: { 'submitDate': -1 } },
      {
        $group: {
          '_id': {
            'answeree': '$answeree',
            'exercise': '$exercise',
          },
          'submitDate': { $first: '$submitDate' },
          'submission': { $first: '$submission' },
        },
      },
      {
        $group: {
          '_id': {
            'exercise': '$_id.exercise',
          },
          'submissions': { $push: '$_id.answeree' },
        },
      },
      {
        $project: {
          '_id': 0,
          'uid': '$_id.exercise',
          'submissions': 1,
        },
      },
    ];

    const submissionsPerExercise = yield this.asq.db.model('ExerciseSubmission')
      .aggregate(pipeline)
      .exec();

    return submissionsPerExercise;
  }),

  presenterConnected: coroutine(function* presenterConnectedGen(info) {
    if (!info.session_id) return info;

    const exercises = yield this.restorePresenterForSession(info.session_id);

    const event = {
      questionType: this.tagName,
      type: 'restorePresenter',
      exercises,
    };

    this.asq.socket.emit('asq:question_type', event, info.socketId);

    // this will be the argument to the next hook
    return info;
  }),

  restoreViewerForSession: coroutine(function* restoreViewerForSessionGen(sessionId, whitelistId) {
    const pipeline = [
      {
        $match: {
          'session': sessionId,
          'answeree': whitelistId,
        },
      },
      { $sort: { 'submitDate': -1 } },
      {
        $group: {
          '_id': '$exercise',
          'submissionNum': { $sum: 1 },
          'confidence': { $first: '$confidence' },
        },
      },
      {
        $project: {
        '_id': 0,
        'uid': '$_id',
        'submissionNum': 1,
        'confidence': '$confidence',
        },
      },
    ];
    const exercises = yield this.asq.db.model('ExerciseSubmission').aggregate(pipeline).exec();

    return exercises;
  }),

  viewerConnected: coroutine(function* viewerConnectedGen(info) {
    const sessionId = info.session_id;
    if (!sessionId) return info;
    const wlId = info.whitelistId;
    let exercises = yield this.restoreViewerForSession(sessionId, wlId);

    let event = {
      questionType: this.tagName,
      type: 'restoreViewer',
      exercises,
    };

    this.asq.socket.emit('asq:question_type', event, info.socketId);

    exercises = yield this.restorePresenterForSession(sessionId);

    event = {
      questionType: this.tagName,
      type: 'restorePresenter',
      exercises,
    };

    this.asq.socket.emitToRoles('asq:question_type', event, sessionId, 'ctrl');

    // this will be the argument to the next hook
    return info;
  }),

  exerciseSubmission: coroutine(function* exerciseSubmission(submission) {
    // controller has made sure that the exercise exists
    // just persist
    yield this.asq.db.model('ExerciseSubmission').create({
      exercise: submission.exerciseUid,
      answers: submission.answers,
      answeree: submission.answeree,
      session: submission.session,
      confidence: submission.confidence,
      submitDate: Date.now(),
    });
    const session = submission.session;
    const objId = ObjectId(submission.exerciseUid);
    this.calculateProgress(session, objId);

    // this will be the argument to the next hook
    return submission;
  }),

  calculateProgress: coroutine(function* calculateProgressGen(sessionId, exerciseId) {
    const pipeline = [
      {
        $match: {
          session: sessionId,
          exercise: exerciseId,
        },
      },
      { $sort: { 'submitDate': -1 } },
      {
        $group: {
          '_id': '$answeree',
        },
      },
    ];
    const submissions = yield this.asq.db.model('ExerciseSubmission')
      .aggregate(pipeline)
      .exec();

    const event = {
      questionType: this.tagName,
      type: 'progress',
      exercise: {
        uid: exerciseId.toString(),
        submissions,
      },
    };
    const sIdStr = sessionId.toString();
    this.asq.socket.emitToRoles('asq:question_type', event, sIdStr, 'ctrl');
  }),


});
