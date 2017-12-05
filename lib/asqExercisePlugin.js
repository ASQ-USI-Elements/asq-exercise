var ASQPlugin = require('asq-plugin');
var ObjectId = require('bson-objectid');
var Promise = require('bluebird');

var coroutine = Promise.coroutine;
var cheerio = require('cheerio');
var _ = require('lodash');

function getArrayValOfCommaSeperatedAttr(attrValue) {
  if (!attrValue) return [];
  return (attrValue).replace(/\s/g, '').split(',');
}

module.exports = ASQPlugin.extend({

  tagName: 'asq-exercise',

  hooks: {
    parse_html: 'parseHtml',

    exercise_submission: 'exerciseSubmission',

    udpate_exercise_settings: 'updateExerciseSettings',
    presenter_connected: 'presenterConnected',
    viewer_connected: 'viewerConnected'
  },


  mixinSettings: function (des, src) {
    for (var i = 0; i < des.length; i += 1) {
      var key = des[i].key;
      if (src.hasOwnProperty(key)) {
        des[i].value = src[key];
      }
    }
  },


  updateExerciseSettingsDB: coroutine(function* updateExerciseSettingsDBGen(exerciseId, settings) {
    var exercise = yield this.asq.db.model('Exercise')
      .findById(exerciseId)
      .exec();
    var currentSettings = exercise.listSettings();
    this.mixinSettings(currentSettings, settings);
    yield exercise.updateSettings(currentSettings);
  }),

  updateExerciseSettingsDust: function (exerciseId, settings, html) {
    var oldSettings = this.parseExerciseSettingsGivenId(html);
    var keys = Object.getOwnPropertyNames(settings);
    for (var i in keys) {
      if (Object.prototype.hasOwnProperty.call(keys, keys[i])) {
        var key = keys[i];
        oldSettings[key] = settings[key];
      }
    }
    return this.writeSettingsAsAttributesToGivenExercise(html, exerciseId, oldSettings);
  },

  updateExerciseSettings: coroutine(function* updateExerciseSettingsGen(option) {
    var exercise = yield this.asq.db.model('Exercise')
      .findById(option.exercise_id)
      .exec();
    if (!exercise) throw new Error('Cannot find exercise.');

    var modifiedHtml = option.html;
    try {
      yield this.updateExerciseSettingsDB(option.exercise_id, option.settings);
      modifiedHtml = this.updateExerciseSettingsDust(option.exercise_id, option.settings, option.html);
      return {
        exerciseId: option.exercise_id,
        html: modifiedHtml,
        settings: option.settings,
        status: 'success'
      };
    } catch (e) {
      return {
        exerciseId: option.exercise_id,
        html: modifiedHtml,
        settings: option.settings,
        status: 'failed'
      };
    }
  }),

  // TODO merge this function with writeSettings
  writeSettingsAsAttributesToGivenExercise: function (html, exerciseId, settings) {
    var $ = cheerio.load(html, {
      decodeEntities: false,
      lowerCaseAttributeNames: false,
      lowerCaseTags: false,
      recognizeSelfClosing: true
    });

    var lSettings = this._convertSettings2CheerioCompatible(this.camel2dashed(settings));
    var query = `${this.tagName}[uid=${exerciseId}]`;
    $(query).attr(lSettings);

    return $.root().html();
  },

  _convertSettings2CheerioCompatible: function (settings) {
    Object.keys(settings).forEach((key) => {
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

  writeSettings: function ($el, settings) {
    var objSettings = {};
    settings.forEach((setting) => {
      objSettings[setting.key] = setting.value;
    });

    var dashedSettings = this.camel2dashed(objSettings);
    var lSettings = this._convertSettings2CheerioCompatible(dashedSettings);
    $el.attr(lSettings);
  },

  parseHtml: coroutine(function* parseHtmlGen(options) {
    var questionElementNames = options.questionElementNames;
    var $ = cheerio.load(options.html, {
      decodeEntities: false,
      lowerCaseAttributeNames: false,
      lowerCaseTags: false,
      recognizeSelfClosing: true
    });

    var slideshow = yield this.asq.db.model('Slideshow')
      .findById(options.slideshow_id)
      .exec();
    var presentationSettings = slideshow.listSettings();

    var flatten = {};
    _.clone(presentationSettings).forEach((setting) => {
      flatten[setting.key] = setting.value;
    });

    var exerciseEls = $(this.tagName).toArray();
    for (var i in exerciseEls) {
      if (!Object.prototype.hasOwnProperty.call(exerciseEls, exerciseEls[i]));
      var el = exerciseEls[i];
      var r = this.processEl($, el, questionElementNames);
      var exercise = yield this.createNewExercise(r._id, r.stem, r.questions, r.assessmentTypes);
      var exSettings = this.parseExerciseSettings($, el);
      var exerciseSettings = this.createExerciseSettings(exSettings, presentationSettings);

      var attempts = 2;
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
          for (var k in exerciseSettings) {
            if (exerciseSettings[k].key === e.key) {
              exerciseSettings[k].value = flatten[e.key];
            }
          }
        }
      }

      this.writeSettings($(el), exerciseSettings);
    }

    options.html = $.root().html();
    return options;
  }),

  /*
   * Priorities: lowest index with highest priority.
   *
   * 1. Exercise-level-user-defined
   * 2. Presentation-level
   * 3. Exercise-defalut
   *
   * @method createExerciseSettings
   * @param exerciseSettings
   * @param presentationSettings
   * @return exercise-settings
   */
  createExerciseSettings: function (exerciseSettings, presentationSettings) {
    var flattenSettings = {};
    presentationSettings.forEach((s) => {
      flattenSettings[s.key] = s.value;
    });

    var defaultExSettings = this.asq.api.settings.defaultSettings.exercise;

    for (var i in defaultExSettings) {
      if (!Object.prototype.hasOwnProperty.call(defaultExSettings, defaultExSettings[i])) {
        return defaultExSettings;
      }
      var key = defaultExSettings[i].key;
      if (exerciseSettings.hasOwnProperty(key)) {
        defaultExSettings[i].value = exerciseSettings[key];
      } else if (flattenSettings.hasOwnProperty(key)) {
        defaultExSettings[i].value = flattenSettings[key];
      }
    }
    return defaultExSettings;
  },


  createNewExercise: coroutine(function* createBlankSlideshowGen(_id, stem, questions) {
    var settings = this.asq.api.settings.defaultSettings.exercise;
    var exercise = yield this.asq.db.model('Exercise').create({
      _id,
      stem,
      questions,
      settings
    });
    return exercise;
  }),

  parseExerciseSettingsGivenId: function (html, exerciseId) {
    var $ = cheerio.load(html, {
      decodeEntities: false,
      lowerCaseAttributeNames: false,
      lowerCaseTags: false,
      recognizeSelfClosing: true
    });
    var query = this.tagName + '[uid=' + exerciseId + ']';
    if (!$(query).length) return {};

    var $el = $(query);
    this._fixBooleanAttributesFromCheerio($el);

    var attr = this._assureBooleanValFromHTMLBooleanAttr($el.attr());

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

    var attr = $el.attr();

    ['disabled', 'confidence'].forEach((key) => {
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

    ['disabled', 'confidence'].forEach((key) => {
      if (attr.hasOwnProperty(key)
        && (attr[key] === key || attr[key] === true)) {
        attr[key] = true;
      }
    });

    return attr;
  },

  dashed2Camel: function (attr) {
    var lAttr = _.clone(attr);
    Object.keys(lAttr).forEach((key) => {
      if (key.indexOf('-') >= 0) {
        var value = lAttr[key];
        delete lAttr[key];
        var camelCased = key.replace(/-([a-z])/g, g => g[1].toUpperCase());
        lAttr[camelCased] = value;
      }
    });
    return lAttr;
  },

  camel2dashed: function (attr) {
    var lAttr = _.clone(attr);
    Object.keys(lAttr).forEach((key) => {
      var value = lAttr[key];
      delete lAttr[key];
      var dashed = key.replace(/([A-Z])/g, $1 => `-${$1.toLowerCase()}`);
      lAttr[dashed] = value;
    });
    return lAttr;
  },

  parseExerciseSettings: function ($, el) {
    var $el = $(el);
    this._fixBooleanAttributesFromCheerio($el);
    var attr = this._assureBooleanValFromHTMLBooleanAttr($el.attr());

    return this.dashed2Camel(attr);
  },

  processEl: function ($, el, questionElementNames) {
    // make sure exercise has a unique id
    var $el = $(el);
    var uid = $el.attr('uid');
    if (uid === undefined || uid.trim() === '') {
      $el.attr('uid', uid = ObjectId().toString());
    }

    // get stem
    var stem = $el.find('asq-stem');
    if (stem.length) {
      stem = stem.eq(0).html();
    } else {
      stem = '';
    }
    var elAttr = $el.attr('assessment');
    var assessmentTypes = getArrayValOfCommaSeperatedAttr(elAttr);
    var questionIds = this.parseQuestions($, el, questionElementNames);
    return {
      _id: uid,
      stem,
      questions: questionIds,
      assessmentTypes
    };
  },

  // TODO: avoid hardcode
  parseQuestions: function ($, el, questionElementNames) {
    var ids = Object.create(null);
    var $el = $(el);

    questionElementNames.forEach((tagName) => {
      $el.find(tagName).each((idx, element) => {
        var $element = $(element);
        var uid = $element.attr('uid');
        if (uid === undefined || uid.trim() === '') {
          $element.attr('uid', uid = ObjectId().toString());
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
    var pipeline = [
      {
        $match: {
          session: sessionId
        }
      },
      { $sort: { submitDate: -1 } },
      {
        $group: {
          _id: {
            answeree: '$answeree',
            exercise: '$exercise'
          },
          submitDate: { $first: '$submitDate' },
          submission: { $first: '$submission' }
        }
      },
      {
        $group: {
          _id: {
            exercise: '$_id.exercise'
          },
          submissions: { $push: '$_id.answeree' }
        }
      },
      {
        $project: {
          _id: 0,
          uid: '$_id.exercise',
          submissions: 1
        }
      }
    ];

    var submissionsPerExercise = yield this.asq.db.model('ExerciseSubmission')
      .aggregate(pipeline)
      .exec();

    return submissionsPerExercise;
  }),

  presenterConnected: coroutine(function* presenterConnectedGen(info) {
    if (!info.session_id) return info;

    var exercises = yield this.restorePresenterForSession(info.session_id);

    var event = {
      questionType: this.tagName,
      type: 'restorePresenter',
      exercises
    };

    this.asq.socket.emit('asq:question_type', event, info.socketId);

    // this will be the argument to the next hook
    return info;
  }),

  restoreViewerForSession: coroutine(function* restoreViewerForSessionGen(sessionId, whitelistId) {
    var pipeline = [
      {
        $match: {
          session: sessionId,
          answeree: whitelistId
        }
      },
      { $sort: { submitDate: -1 } },
      {
        $group: {
          _id: '$exercise',
          submissionNum: { $sum: 1 },
          confidence: { $first: '$confidence' }
        }
      },
      {
        $project: {
          _id: 0,
          uid: '$_id',
          submissionNum: 1,
          confidence: '$confidence'
        }
      }
    ];
    var exercises = yield this.asq.db.model('ExerciseSubmission').aggregate(pipeline).exec();

    return exercises;
  }),

  viewerConnected: coroutine(function* viewerConnectedGen(info) {
    var sessionId = info.session_id;
    if (!sessionId) return info;
    var wlId = info.whitelistId;
    var exercises = yield this.restoreViewerForSession(sessionId, wlId);

    var event = {
      questionType: this.tagName,
      type: 'restoreViewer',
      exercises
    };

    this.asq.socket.emit('asq:question_type', event, info.socketId);

    exercises = yield this.restorePresenterForSession(sessionId);

    event = {
      questionType: this.tagName,
      type: 'restorePresenter',
      exercises
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
      submitDate: Date.now()
    });
    var session = submission.session;
    var objId = ObjectId(submission.exerciseUid);
    this.calculateProgress(session, objId);

    // this will be the argument to the next hook
    return submission;
  }),

  calculateProgress: coroutine(function* calculateProgressGen(sessionId, exerciseId) {
    var pipeline = [
      {
        $match: {
          session: sessionId,
          exercise: exerciseId
        }
      },
      { $sort: { submitDate: -1 } },
      {
        $group: {
          _id: '$answeree'
        }
      }
    ];
    var submissions = yield this.asq.db.model('ExerciseSubmission')
      .aggregate(pipeline)
      .exec();

    var event = {
      questionType: this.tagName,
      type: 'progress',
      exercise: {
        uid: exerciseId.toString(),
        submissions
      }
    };
    var sIdStr = sessionId.toString();
    this.asq.socket.emitToRoles('asq:question_type', event, sIdStr, 'ctrl');
  })


});
