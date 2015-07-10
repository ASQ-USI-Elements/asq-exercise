var ASQPlugin = require('asq-plugin');
var ObjectId = require('mongoose').Types.ObjectId;
var Promise = require('bluebird');
var coroutine = Promise.coroutine;
var cheerio = require('cheerio');
var _ = require('lodash');
var Exercise = db.model('Exercise');
var Setting = db.model('Setting');


//http://www.w3.org/html/wg/drafts/html/master/infrastructure.html#boolean-attributes
function getBooleanValOfBooleanAttr(attrName, attrValue){
  if(attrValue === '' || attrValue === attrName){
    return true;
  }
  return false;
}

function getArrayValOfCommaSeperatedAttr(attrValue){
  if(!attrValue) return []
  return (attrValue).replace(/\s/g, '').split(',')
}

module.exports = ASQPlugin.extend({

  tagName : 'asq-exercise',

  hooks:{
    "parse_html"                        : "parseHtml",
    "exercise_submission"               : "exerciseSubmission",

    "udpate_exercise_settings"          : "updateExerciseSettings",
    "presenter_connected"               : "presenterConnected",
    "viewer_connected"                  : "viewerConnected"
  },



  updateExerciseSettingsDB: coroutine(function *updateExerciseSettingsDBGen(exercise_id, settings){
    var exercise = yield this.asq.db.model("Exercise").findById(exercise_id).exec();
    if ( ! exercise ) throw 'Cannot find exercise.';

    var currentSettings = yield exercise.getSettings();
    yield this.mixinSettings(currentSettings, settings);
  }),

  updateExerciseSettingsDust: coroutine(function *updateExerciseSettingsDustGen(exercise_id, settings, html){
    var oldSettings = this.parseExerciseSettingsGivenId(html);

    var keys = Object.getOwnPropertyNames(settings);
    for ( var i in keys ) {
      var key = keys[i];
      oldSettings[key] = settings[key];
    }
    return this.writeSettingsAsAttributesToGivenExercise(html, exercise_id, oldSettings);
  }),

  updateExerciseSettings: coroutine(function *updateExerciseSettingsGen (option){
    console.log('updateExerciseSettings');

    yield this.updateExerciseSettingsDB(option.exercise_id, option.settings);

    var modifiedHtml = yield this.updateExerciseSettingsDust(option.exercise_id, option.settings, option.html);

    return {
      exercise_id: option.exercise_id,
      html: modifiedHtml,
      settings: option.settings
    };
  }),

  writeSettingsAsAttributesToGivenExercise: function(html, exercise_id, settings) {
    var $ = cheerio.load(html, {decodeEntities: false});
    var l_settings = this.lowerCaseAttributes(settings);

    var query = this.tagName + '[uid=' + exercise_id + ']';

    $(query).attr(l_settings);
    return Promise.resolve($.root().html());
  },

  lowerCaseAttributes: function(attrs){
    var newAttrs = {};
    for ( var key in attrs ) {
      newAttrs[key.toLowerCase()] = attrs[key];
    }
    return newAttrs;
  },

  writeSettings: function($el, settings) {
    settings.forEach(function(setting, index){
      var key = setting.key.toLowerCase();
      $el.attr(key, setting.value);
    }, this);
  },

  parseHtml: coroutine(function *parseHtmlGen(option) {
    var html = option.html;
    var $ = cheerio.load(html, {decodeEntities: false});
    var exercises = [];

    var tags = $(this.tagName).toArray();
    for ( var i in tags ) {
      var el = tags[i];
      var r = this.processEl($, el);
      var exercise = yield this.createBlankExercise(r._id, r.questions, r.assessmentTypes);
      var settings = this.parseExerciseSettings($, el);
      var exerciseSettings = yield exercise.getSettings();
      yield this.mixinSettings(exerciseSettings, settings);
      this.writeSettings($(el), exerciseSettings);
    }

    option.html = $.root().html();
    return option;
  }),

  mixinSettings: coroutine(function* mixinSettingsGen(des, src) {
    for ( var i=0; i<des.length; i++ ) {
      var key = des[i].key;
      if ( src.hasOwnProperty(key) ) {
        des[i].value = src[key];
        des[i].markModified('value');
        yield des[i].save();
      } 
    }
  }),

  getDefaultSettingsForNewExercise: coroutine(function*getDefaultSettingsForNewExerciseGen() {
    var settingsArray = [
      {
        key: 'maxNumSubmissions',
        value: 0,
        kind: 'number',
      },
      {
        key: 'confidence',
        value: false,
        kind: 'boolean',
      }
    ];

    return yield Setting.create(settingsArray);
  }),

  createBlankExercise: coroutine(function *createBlankSlideshowGen(_id, questions, assessmentTypes) {
    var settings = yield this.getDefaultSettingsForNewExercise();
    var settingIds =  settings.map(function(s){ return s._id;})

    var exercise = yield Exercise.create({
      _id: _id,
      questions: questions,
      assessmentTypes: assessmentTypes,
      settings : settingIds
    });
    return exercise;
  }),

  parseExerciseSettingsGivenId: function(html, exercise_id) {
    var $ = cheerio.load(html, {decodeEntities: false});
    var query = this.tagName + '[uid=' + exercise_id + ']';
    if(! $(query).length) return {};

    var attr = $(query).attr();

    //TODO: be general
    attr['maxNumSubmissions'] = attr['maxnumsubmissions'];
    delete attr['maxnumsubmissions'];

    return attr ;
  },

  parseExerciseSettings: function($, el) {
    var $el = $(el);
    var attr = $el.attr();

    var maxNumSubmissions = attr['maxnumsubmissions'];
    if ( maxNumSubmissions ) {
      maxNumSubmissions = Number(maxNumSubmissions);
      if ( maxNumSubmissions < 0 ) maxNumSubmissions = -1;
      $el.attr('maxnumsubmissions', maxNumSubmissions);

      attr['maxNumSubmissions'] = attr['maxnumsubmissions'];
      delete attr['maxnumsubmissions'];

      return attr;
    }
    else {
      return attr
    }

  },

  processEl: function($, el){
    //make sure exercise has a unique id
    var $el = $(el);
    var uid = $el.attr('uid');
    if(uid == undefined || uid.trim() == ''){
      $el.attr('uid', uid = ObjectId().toString() );
    } 

    var assessmentTypes = getArrayValOfCommaSeperatedAttr($el.attr('assessment'));
    var questionIds = this.parseQuestions($, el);
    return {
      _id : uid,
      questions: questionIds,
      assessmentTypes: assessmentTypes
    }
  },

  // TODO: avoid hardcode
  parseQuestions: function($, el){
    var ids = Object.create(null);
    var $el = $(el);
    var questionTagNames = [
    'asq-multi-choice-q',
    'asq-text-input-q',
    'asq-code-q',
    'asq-css-select-q',
    'asq-js-function-body-q',
    'asq-order-q',
    'asq-buckets-q'
    ]

    questionTagNames.forEach(function eachTagName(tagName){

      $el.find(tagName).each(function eachTagNameEl(idx, el){

        var $el = $(el); 
        var uid = $el.attr('uid');
        if(uid == undefined || uid.trim() == ''){
          $el.attr('uid', uid = ObjectId().toString() );
        } 
        if(ids[uid]){
          throw new Error ('An exercise cannot have two questions with the same uids');
        }
        ids[uid] = true;
      });
    });

    return Object.keys(ids);
  }, 

  restorePresenterForSession: coroutine(function *restorePresenterForSessionGen(session_id){
    var pipeline = [
      { $match: {
          session: session_id,
        }
      },
      { $sort:{"submitDate": -1}},
      { $group:{
          "_id":{
            "answeree" : "$answeree",
            "exercise" : "$exercise"
          },
          "submitDate":{$first:"$submitDate"},
          "submission": {$first:"$submission"},
        }
      },
      { $group:{
          "_id":{
            "exercise" : "$_id.exercise"
          },
          "submissions": {$push: "$_id.answeree"},
        }
      },
      { $project : { 
          "_id": 0,
          "uid" : "$_id.exercise",
          "submissions" : 1
        } 
      }
    ]

    var submissionsPerExercise = yield this.asq.db.model('ExerciseSubmission').aggregate(pipeline).exec();
    
    return submissionsPerExercise;    
  }),

  presenterConnected: coroutine(function *presenterConnectedGen (info){

    if(! info.session_id) return info;

    var exercises = yield this.restorePresenterForSession(info.session_id);

    var event = {
      questionType: this.tagName,
      type: 'restorePresenter',
      exercises: exercises
    }

    this.asq.socket.emit('asq:question_type', event, info.socketId)

    //this will be the argument to the next hook
    return info;
  }),

  restoreViewerForSession: coroutine(function *restoreViewerForSessionGen(session_id, whitelistId){
    var pipeline = [
      { $match: {
          "session": session_id,
          "answeree" : whitelistId
        }
      },
      { $sort:{"submitDate": -1}},
      { $group:{
          "_id": "$exercise",
           "submissionNum" : {$sum: 1}
        }
      },
      { $project:{
        "_id": 0,
        "uid" : '$_id',
        "submissionNum" : 1
        }
      }
    ]
    var exercises = yield this.asq.db.model('ExerciseSubmission').aggregate(pipeline).exec();

    return exercises;    
  }),

  viewerConnected: coroutine(function *viewerConnectedGen (info){

    if(! info.session_id) return info;

    var exercises = yield this.restoreViewerForSession(info.session_id, info.whitelistId);

    var event = {
      questionType: this.tagName,
      type: 'restoreViewer',
      exercises: exercises
    }

    this.asq.socket.emit('asq:question_type', event, info.socketId);

    var exercises = yield this.restorePresenterForSession(info.session_id);

    var event = {
      questionType: this.tagName,
      type: 'restorePresenter',
      exercises: exercises
    }

    this.asq.socket.emitToRoles('asq:question_type', event, info.session_id, 'ctrl')

    // this will be the argument to the next hook
    return info;
  }),

  exerciseSubmission: coroutine(function *exerciseSubmission (submission){
    // console.log(' -- exerciseSubmission', submission);
    // controller has made sure that the exercise exists
    // just persist
    yield this.asq.db.model("ExerciseSubmission").create({
      exercise   : submission.exerciseUid,
      answers    : submission.answers,
      answeree   : submission.answeree,
      session    : submission.session,
      confidence : submission.confidence,
      submitDate : Date.now()
    });

    this.calculateProgress(submission.session, ObjectId(submission.exerciseUid));

    //this will be the argument to the next hook
    return submission;
  }),

  calculateProgress: coroutine(function *calculateProgressGen(session_id, exercise_id){
    var criteria = {session: session_id, exercise:exercise_id};
    var pipeline = [
      { $match: {
          session: session_id,
          exercise : exercise_id
        }
      },
      {$sort:{"submitDate":-1}},
      { $group:{
          "_id":"$answeree"
        }
      }
    ]
    var submissions = yield this.asq.db.model('ExerciseSubmission').aggregate(pipeline).exec();

    var event = {
      questionType: this.tagName,
      type: 'progress',
      exercise: {
        uid: exercise_id.toString(),
        submissions: submissions
      }
    }

    // console.log('calculateProgress', event)

    this.asq.socket.emitToRoles('asq:question_type', event, session_id.toString(), 'ctrl')
  })



});