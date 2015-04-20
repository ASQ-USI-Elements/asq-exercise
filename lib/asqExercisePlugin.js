var ASQPlugin = require('asq-plugin');
var ObjectId = require('mongoose').Types.ObjectId;
var Promise = require('bluebird');
var cheerio = require('cheerio');


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
    "parse_html" : "parseHtml"
    // "createQuestion" : createQuestion,
    // "receivedAnswer" : receivedAnswer,
    // "autoAssess" : autoAssess 
  },

  parseHtml: function(html){
    var $ = cheerio.load(html, {decodeEntities: false});
    var exercises = [];

    $(this.tagName).each(function(idx, el){
      exercises.push(this.processEl($, el));
    }.bind(this));

    //return Promise that resolves with the (maybe modified) html
    return this.asq.db.model("Exercise").create(exercises)
    .then(function(){
      return Promise.resolve($.root().html());
    });
    
  },

  processEl: function($, el){

    //make sure exercise has a unique id
    var $el = $(el);
    var uid = $el.attr('uid');
    if(uid == undefined || uid.trim() == ''){
      $el.attr('uid', uid = ObjectId().toString() );
    } 

    //can viewers resubmit this exercise?
    var resubmit = getBooleanValOfBooleanAttr("allowresubmit", $el.attr('allowresubmit'))
    var assessmentTypes = getArrayValOfCommaSeperatedAttr($el.attr('assessment'));

    //parse options
    var questionIds = this.parseQuestions($, el);

    return {
      _id : uid,
      assessmentTypes: assessmentTypes,
      resubmit: resubmit,
      questions: questionIds
    }
  },

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
  } 
});