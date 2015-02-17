"use strict";

var chai = require('chai');
var sinon = require("sinon");
var should = chai.should();
var expect = chai.expect;
var cheerio = require('cheerio');
var Promise = require('bluebird');
var modulePath = "../lib/asqExercisePlugin";
var fs = require("fs");

describe("asqExercisePlugin.js", function(){
  
  before(function(){
    var then =  this.then = function(cb){
      return cb();
    };

    var create = this.create = sinon.stub().returns({
      then: then
    });

    this.tagName = "asq-exercise";

    this.asq = {
      registerHook: function(){},
      db: {
        model: function(){
          return {
            create: create
          }
        }
      }
    }

    //load html fixtures
    this.simpleHtml = fs.readFileSync(require.resolve('./fixtures/simple.html'), 'utf-8');
    this.attributesHtml = fs.readFileSync(require.resolve('./fixtures/attributes.html'), 'utf-8');
    this.questionsHtml = fs.readFileSync(require.resolve('./fixtures/questions.html'), 'utf-8');
    
    this.asqExercisePlugin = require(modulePath);
  });

   describe("parseHtml", function(){

    before(function(){
     sinon.stub(this.asqExercisePlugin.prototype, "processEl").returns("res");
    });

    beforeEach(function(){
      this.asqEx = new this.asqExercisePlugin(this.asq);
      this.asqExercisePlugin.prototype.processEl.reset();
      this.create.reset();
    });

    after(function(){
     this.asqExercisePlugin.prototype.processEl.restore();
    });

    it("should call processEl() for all asq-exercise elements", function(done){
      this.asqEx.parseHtml(this.simpleHtml)
      .then(function(){
        this.asqEx.processEl.calledThrice.should.equal(true);
        done();
      }.bind(this))
      .catch(function(err){
        done(err);
      });
    });

    it("should call `model().create()` to persist parsed exercise in the db", function(done){
      this.asqEx.parseHtml(this.simpleHtml)
      .then(function(result){
        this.create.calledOnce.should.equal(true);
        this.create.calledWith(["res", "res", "res"]).should.equal(true);
        done();
      }.bind(this))
      .catch(function(err){
        done(err);
      });
    });

    it("should resolve with the file's html", function(done){
      this.asqEx.parseHtml(this.simpleHtml)
      .then(function(result){
        expect(result).to.equal(this.simpleHtml);
        done();
      }.bind(this))
      .catch(function(err){
        done(err);
      });
    });

  });

  describe("processEl", function(){

    before(function(){
     sinon.stub(this.asqExercisePlugin.prototype, "parseQuestions").returns([]);
    });

    beforeEach(function(){
      this.asqEx = new this.asqExercisePlugin(this.asq);
      this.asqExercisePlugin.prototype.parseQuestions.reset();
    });

    after(function(){
     this.asqExercisePlugin.prototype.parseQuestions.restore();
    });

    it("should assign a uid to the exercise if there's not one", function(){
      var $ = cheerio.load(this.simpleHtml);
      
      //this doesn't have an id
      var el = $("#no-uid")[0];
      this.asqEx.processEl($, el);
      $(el).attr('uid').should.exist;
      $(el).attr('uid').should.not.equal("a-uid");

      //this already has one
      el = $("#uid")[0];
      this.asqEx.processEl($, el);
      $(el).attr('uid').should.exist;
      $(el).attr('uid').should.equal("a-uid");
    });

    it("should call parseQuestions()", function(){
      var $ = cheerio.load(this.simpleHtml);
      var el = $(this.tagName)[0];

      this.asqEx.processEl($, el);
      this.asqEx.parseQuestions.calledOnce.should.equal(true);
    });

    it("should set `resubmit` corretly", function(){
      var $ = cheerio.load(this.attributesHtml);

      var el = $("#no-allowresubmit")[0];
      var result = this.asqEx.processEl($, el);
      expect(result.resubmit).to.equal(false);

      el = $("#allowresubmit")[0];
      result = this.asqEx.processEl($, el);
      expect(result.resubmit).to.equal(true);

      el = $("#allowresubmit-val")[0];
      result = this.asqEx.processEl($, el);
      expect(result.resubmit).to.equal(true);
    });

    it("should set `assessmentTypes` corretly", function(){
      var $ = cheerio.load(this.attributesHtml);

      var el = $("#no-assessment")[0];
      var result = this.asqEx.processEl($, el);
      expect(result.assessmentTypes).to.deep.equal([]);

      el = $("#assessment-empty")[0];
      result = this.asqEx.processEl($, el);
      expect(result.assessmentTypes).to.deep.equal([]);

      el = $("#assessment-one-value")[0];
      result = this.asqEx.processEl($, el);
      expect(result.assessmentTypes).to.deep.equal(["auto"]);

       el = $("#assessment-multi-value")[0];
      result = this.asqEx.processEl($, el);
      expect(result.assessmentTypes).to.deep.equal(["auto", "self", "peer"]);
    });
  });

  describe("parseQuestions", function(){

    beforeEach(function(){
      this.$ = cheerio.load(this.questionsHtml);
      this.asqEx = new this.asqExercisePlugin(this.asq);
    });

    it("should assign a uid to options that don't have one", function(){
      var el;

      el = this.$("#no-uids")[0];
      this.asqEx.parseQuestions(this.$, el);
      this.$(el).find('asq-multi-choice').eq(0).attr('uid').should.exist;
      this.$(el).find('asq-highlight').eq(0).attr('uid').should.exist;

      el = this.$("#uids-ok")[0];
      this.asqEx.parseQuestions(this.$, el);
      this.$(el).find('asq-code-input').eq(0).attr('uid').should.equal("uid-1");
      this.$(el).find('asq-js-function-body').eq(0).attr('uid').should.equal("uid-2");
    });

    it("should throw an error when there are more than questions with the same uid", function(){
      var el = this.$("#same-uids")[0];
      var bindedFn = this.asqEx.parseQuestions.bind(this.asqEx, this.$, el);
      expect(bindedFn).to.throw(/cannot have two questions with the same uids/);
    });

    it("should return an array of uis", function(){
      var el = this.$("#uids-ok")[0];
      var result = this.asqEx.parseQuestions(this.$, el);
      expect(result).to.deep.equal(['uid-1', 'uid-2']);
    });
  });
});
