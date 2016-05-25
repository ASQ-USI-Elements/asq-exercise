"use strict";

var chai = require('chai');
var sinon = require("sinon");
var should = chai.should();
var expect = chai.expect;
var cheerio = require('cheerio');
var Promise = require('bluebird');
var modulePath = "../../lib/asqExercisePlugin";
var fs = require("fs");

function fakeResolved(value) {
  return {
    then: function(callback) {
        callback(value);
    }
  }
}

describe("asqExercisePlugin.js", function(){
  
  before(function(){
    var settings = [
      { key: 'maxNumSubmissions',
        value: 1,
        kind: 'number',
        level: 'exercise' 
      },
      { key: 'assessment',
        value: 'none',
        kind: 'select',
        params: { options: [Object] },
        level: 'exercise' 
      },
      { key: 'confidence',
        value: false,
        kind: 'boolean',
        level: 'exercise' 
      } 
    ];

    var listSettingsStub = this.listSettingsStub = sinon.stub().returns(settings);

    //patch database API
    var createStub = this.createStub = sinon.stub().returns(fakeResolved());

    var findByIdStub = this.findByIdStub = sinon.stub().returns({
      exec: function(){
        return fakeResolved({
          listSettings: listSettingsStub
        })
      }
    });

    this.tagName = "asq-exercise";

    this.asq = {
      registerHook: function(){},
      db: {
        model: function(){
          return {
            create: createStub,
            findById: findByIdStub
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
     sinon.stub(this.asqExercisePlugin.prototype, "processEl").returns({
      _id: "test-id",
      stem: "test-stem",
      questions: ["test-q-1", "test-q-1"],
      assessmentTypes: ["test-assessment-type"]
     });

     var updateSettingsStub = this.updateSettingsStub = sinon.stub().returns(fakeResolved());
     sinon
      .stub(this.asqExercisePlugin.prototype, "createNewExercise")
      .returns(fakeResolved({updateSettings: updateSettingsStub}));

     sinon.stub(this.asqExercisePlugin.prototype, "parseExerciseSettings").returns("res");
     sinon.stub(this.asqExercisePlugin.prototype, "createExerciseSettings").returns("res");
     sinon.stub(this.asqExercisePlugin.prototype, "writeSettings").returns("res");
    });

    beforeEach(function(){
      this.asqEx = new this.asqExercisePlugin(this.asq);
      this.asqExercisePlugin.prototype.processEl.reset();
      this.asqExercisePlugin.prototype.createNewExercise.reset();
      this.asqExercisePlugin.prototype.parseExerciseSettings.reset();
      this.asqExercisePlugin.prototype.createExerciseSettings.reset();
      this.asqExercisePlugin.prototype.writeSettings.reset();
      this.createStub.reset();
      this.findByIdStub.reset();
      this.listSettingsStub.reset();
      this.updateSettingsStub.reset();
    });

    after(function(){
     this.asqExercisePlugin.prototype.processEl.restore();
     this.asqExercisePlugin.prototype.createNewExercise.restore();
     this.asqExercisePlugin.prototype.parseExerciseSettings.restore();
     this.asqExercisePlugin.prototype.createExerciseSettings.restore();
    });

    it("should retrieve the current slideshow settings", function(done){
      this.asqEx.parseHtml({ html: this.simpleHtml, slideshow_id: "test-id" })
      .then(function(){
        this.findByIdStub.calledOnce.should.equal(true);
        this.findByIdStub.calledWithExactly("test-id");
        this.listSettingsStub.calledOnce.should.equal(true);
        done();
      }.bind(this))
      .catch(function(err){
        done(err);
      });
    });

    it("should call processEl() for all asq-exercise elements", function(done){
      this.asqEx.parseHtml({ html: this.simpleHtml, slideshow_id: "test-id" })
      .then(function(){
        this.asqEx.processEl.calledThrice.should.equal(true);
        done();
      }.bind(this))
      .catch(function(err){
        done(err);
      });
    });

    it("should call createNewExercise() to create a new exercise", function(done){
      this.asqEx.parseHtml({ html: this.simpleHtml, slideshow_id: "test-id" })
      .then(function(){
        this.asqEx.createNewExercise.calledThrice.should.equal(true);
        this.asqEx.createNewExercise.calledWithExactly(
          "test-id", "test-stem", ["test-q-1", "test-q-1"], ["test-assessment-type"]);
        done();
      }.bind(this))
      .catch(function(err){
        done(err);
      });
    });

    it("should call parseExerciseSettings() to parse the settings of the element", function(done){
      this.asqEx.parseHtml({ html: this.simpleHtml, slideshow_id: "test-id" })
      .then(function(){
        this.asqEx.parseExerciseSettings.calledThrice.should.equal(true);
        done();
      }.bind(this))
      .catch(function(err){
        done(err);
      });
    });

    it("should call createExerciseSettings() to create the settings for the db", function(done){
      this.asqEx.parseHtml({ html: this.simpleHtml, slideshow_id: "test-id" })
      .then(function(){
        this.asqEx.createExerciseSettings.calledThrice.should.equal(true);
        done();
      }.bind(this))
      .catch(function(err){
        done(err);
      });
    });

    it("should call update the settings in the database", function(done){
      this.asqEx.parseHtml({ html: this.simpleHtml, slideshow_id: "test-id" })
      .then(function(){
        this.updateSettingsStub.calledThrice.should.equal(true);
        done();
      }.bind(this))
      .catch(function(err){
        done(err);
      });
    });

    it("should call writeSettings() to write the resolved settings back to the element", function(done){
      this.asqEx.parseHtml({ html: this.simpleHtml, slideshow_id: "test-id" })
      .then(function(){
        this.asqEx.writeSettings.calledThrice.should.equal(true);
        done();
      }.bind(this))
      .catch(function(err){
        done(err);
      });
    });

    it("should resolve with the correct object", function(done){
      this.asqEx.parseHtml({ html: this.simpleHtml, slideshow_id: "test-id" })
      .then(function(result){
        expect(result).to.deep.equal({ html: this.simpleHtml, slideshow_id: "test-id" });
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

    it("should parse the stem correctly", function(){
      var $ = cheerio.load(this.simpleHtml);
      var el = $(this.tagName)[0];

      var res = this.asqEx.processEl($, el);
      res.stem.should.equal("This is a stem");


      //test when there's no stem
      $(el).find('asq-stem').remove();
      res = this.asqEx.processEl($, el);
      res.stem.should.equal("");
    });

    it("should set `assessmentTypes` correctly", function(){
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
      this.questionElementNames = [
        "asq-multi-choice-q",
        "asq-highlight-q",
        "asq-code-q",
        "asq-js-function-body-q",
        "asq-css-select-q"
      ];
    });

    it("should assign a uid to options that don't have one", function(){
      var el;

      el = this.$("#no-uids")[0];
      this.asqEx.parseQuestions(this.$, el, this.questionElementNames);
      this.$(el).find('asq-multi-choice-q').eq(0).attr('uid').should.exist;
      this.$(el).find('asq-highlight-q').eq(0).attr('uid').should.exist;

      el = this.$("#uids-ok")[0];
      this.asqEx.parseQuestions(this.$, el, this.questionElementNames);
      this.$(el).find('asq-code-q').eq(0).attr('uid').should.equal("uid-1");
      this.$(el).find('asq-js-function-body-q').eq(0).attr('uid').should.equal("uid-2");
    });

    it("should throw an error when there are more than questions with the same uid", function(){
      var el = this.$("#same-uids")[0];
      var bindedFn = this.asqEx.parseQuestions.bind(this.asqEx, this.$, el, this.questionElementNames);
      expect(bindedFn).to.throw(/An exercise cannot have two questions with the same uids/);
    });

    it("should return an array of uis", function(){
      var el = this.$("#uids-ok")[0];
      var result = this.asqEx.parseQuestions(this.$, el, this.questionElementNames);
      expect(result).to.deep.equal(['uid-1', 'uid-2']);
    });
  });

  describe("updateExerciseSettingsDB", function(){
    it.skip("should test this method")
  })
  describe("updateExerciseSettings", function(){
    it.skip("should test this method")
  })
  describe("writeSettingsAsAttributesToGivenExercise", function(){
    it.skip("should test this method")
  })
  describe("_convertSettings2CheerioCompatible", function(){
    it.skip("should test this method")
  })
  describe("createExerciseSettings", function(){
    it.skip("should test this method")
  })
  describe("createNewExercise", function(){
    it.skip("should test this method")
  })
  describe("parseExerciseSettingsGivenId", function(){
    it.skip("should test this method")
  })
  describe("_fixBooleanAttributesFromCheerio", function(){
    it.skip("should test this method")
  })
  describe("_assureBooleanValFromHTMLBooleanAttr", function(){
    it.skip("should test this method")
  })
  describe("dashed2Camel", function(){
    it.skip("should test this method")
  })
  describe("camel2dashed", function(){
    it.skip("should test this method")
  })
  describe("parseExerciseSettings", function(){
    it.skip("should test this method")
  })
  describe("restorePresenterForSession", function(){
    it.skip("should test this method")
  })
  describe("presenterConnected", function(){
    it.skip("should test this method")
  })
  describe("restoreViewerForSession", function(){
    it.skip("should test this method")
  })
  describe("viewerConnected", function(){
    it.skip("should test this method")
  })
  describe("exerciseSubmission", function(){
    it.skip("should test this method")
  })
  describe("calculateProgress", function(){
    it.skip("should test this method")
  })
});
