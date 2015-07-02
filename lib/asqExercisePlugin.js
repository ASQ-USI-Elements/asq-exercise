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

  //TODO may delete this
  createConfiguration: function(option) {

    // var $ = cheerio.load(option.html, {decodeEntities: false});
    // $(this.tagName).each(function(idx, el){
    //   var $el = $(el);
    //   var uid = $el.attr('uid');
      
    //   var confidence = $el.attr('confidence');
    //   confidence = (_.isUndefined(confidence) || _.isNull(confidence)) ? false : true;
      
    //   var maxNumSubmissions = Number($el.attr('maxnumsubmissions'));
    //   if ( _.isUndefined(maxNumSubmissions) || _.isNull(maxNumSubmissions) || maxNumSubmissions < 0 ) {
    //     maxNumSubmissions = option.conf.maxNumSubmissions;
    //   }
    //   this.asq.db.model("Exercise").findById(uid, function(err, exercise) {
    //     exercise.maxNumSubmissions = maxNumSubmissions;
    //     exercise.confidence = confidence;
    //     exercise.save();
    //   }.bind(this));

    //   $el.attr('maxnumsubmissions', maxNumSubmissions);
    //   if ( confidence ) $el.attr('confidence', true);
    //   else $el.attr('confidence', null);
 
    // }.bind(this));

    // return Promise.resolve({
    //   slideshow_id : option.slideshow_id,
    //   conf         : option.conf,
    //   html         : $.root().html(),
    // });
    return Promise.resolve(option);
  },

  lowerCaseAttributes: coroutine(function *lowerCaseAttributes(attrs){
    var newAttrs = {};
    for ( var key in attrs ) {
      if ( attrs.hasOwnProperty(key) ) {
        newAttrs[key.toLowerCase()] = attrs[key];
      }
    }
    return Promise.resolve(newAttrs)
  }),

  // update all exercises' configurations compulsorily
  // updateConfiguration: coroutine(function *updateConfiguration (option){
    // console.log('updateExerciseConfiguration');
    // var $ = cheerio.load(option.html, {decodeEntities: false});
    // var conf = option.conf;
    // var lowercaseConf = yield this.lowerCaseAttributes(conf);

    // $(this.tagName).each(function(idx, el){
    //   var $el = $(el);
    //   var uid = $el.attr('uid');

    //   this.asq.db.model("Exercise").findById(uid, function(err, exercise) {
    //     exercise.maxNumSubmissions = conf.maxNumSubmissions;
    //     exercise.save();
    //   }.bind(this));

    //   $el.attr(lowercaseConf);
    // }.bind(this));

  //   return Promise.resolve(option);
  // }),

  // updateExerciseConfiguration: coroutine(function *updateConfiguration (option){
  //   var $ = cheerio.load(option.html, {decodeEntities: false});
  //   var conf = option.conf;
  //   var lowercaseConf = yield this.lowerCaseAttributes(conf);

  //   $(this.tagName).each(function(idx, el){
  //     var $el = $(el);
  //     var uid = $el.attr('uid');

  //     this.asq.db.model("Exercise").findById(uid, function(err, exercise) {
  //       exercise.maxNumSubmissions = conf.maxNumSubmissions;
  //       exercise.save();
  //     }.bind(this));

  //     $el.attr(lowercaseConf);
  //   }.bind(this));

  //   return Promise.resolve($.root().html());
  // }),

  // TODO: modify html
  updateExerciseSettings: coroutine(function *updateExerciseSettingsGen (option){

    // modify database
    var exercise = option.exercise ;
    var newSettings = option.settings;
    var currentSettings = yield exercise.getSettings();

    yield this.mixin(currentSettings, newSettings);
    yield exercise.save();

    // $(this.tagName).each(function(idx, el){
    //   var $el = $(el);
    //   var uid = $el.attr('uid');

    //   if ( uid == option.exerciseId ) {
    //     this.asq.db.model("Exercise").findById(uid, function(err, exercise) {
    //       exercise.maxNumSubmissions = conf.maxNumSubmissions;
    //       exercise.confidence = conf.confidence;
    //       exercise.save();
    //     }.bind(this));
    //     if ( !lowercaseConf.hasOwnProperty('confidence') || !lowercaseConf.confidence ) 
    //       lowercaseConf.confidence = null;
    //     $el.attr(lowercaseConf);
    //   }
    // }.bind(this));

    return Promise.resolve(option);
  }),

  parseHtml: coroutine(function *parseHtmlGen(html) {
    var $ = cheerio.load(html, {decodeEntities: false});
    var exercises = [];

    var tags = $(this.tagName).toArray();
    for ( var i in tags ) {
      var el = tags[i];
      var r = this.processEl($, el);
      var exercise = yield this.createBlankExercise(r._id, r.questions, r.assessmentTypes);
      var settings = this.parseExerciseSettings($, el);
      var exerciseSettings = yield exercise.getSettings();

      yield this.mixin(exerciseSettings, settings);
    }

    return $.root().html();
  }),

  // TODO: might use setting._id directly
  mixin: coroutine(function* mixinGen(des, src) {
    for ( var i=0; i<des.length; i++ ) {
      var key = des[i].key;
      if ( src.hasOwnProperty(key) ) {
        des[i].value = src[key];
        des[i].markModified('value');
        yield des[i].save();
      } 
    }
  }),

  createBlankExercise: coroutine(function *createBlankSlideshowGen(_id, questions, assessmentTypes) {
    var exercise = yield Exercise.create({
      _id: _id,
      questions: questions,
      assessmentTypes: assessmentTypes
    });

    //TODO 
    // Add default exercise settings
    var max = new Setting({
      key: 'maxNumSubmissions',
      value: 0,
      kind: 'number',
    });
    yield max.save();
    exercise.settings.push(max);

    var confidence = new Setting({
      key: 'confidence',
      value: false,
      kind: 'boolean',
    });
    yield confidence.save();
    exercise.settings.push(confidence);

    yield exercise.save();

    return exercise;
  }),

  parseExerciseSettings: function($, el) {
    var $el = $(el);
    var attr = $el.attr();

    var maxNumSubmissions = $el.attr('maxnumsubmissions');
    maxNumSubmissions = !maxNumSubmissions ? -1 : Number(maxNumSubmissions);
    if ( maxNumSubmissions < 0 ) maxNumSubmissions = -1;
    $el.attr('maxnumsubmissions', maxNumSubmissions);

    attr['maxNumSubmissions'] = attr['maxnumsubmissions'];
    delete attr['maxnumsubmissions'];

    return attr;

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
    'asq-multi-choice',
    'asq-text-input',
    'asq-code',
    'asq-rating',
    'asq-highlight',
    'asq-css-select',
    'asq-js-function-body',
    'asq-order',
    'asq-buckets'
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