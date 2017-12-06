'use strict';

let chai = require('chai');
let sinon = require('sinon');

let should = chai.should();
let expect = chai.expect;
let cheerio = require('cheerio');
let Promise = require('bluebird');

let modulePath = '../../lib/asqExercisePlugin';
let fs = require('fs');

function fakeResolved(value) {
  return {
    then: function(callback) {
        callback(value);
    },
  };
}

describe('asqExercisePlugin.js', function() {
  before(function() {
    let settings = this.settings = [
      { key: 'maxNumSubmissions',
        value: 1,
        kind: 'number',
        level: 'exercise',
      },
      { key: 'assessment',
        value: 'none',
        kind: 'select',
        params: { options: [Object] },
        level: 'exercise',
      },
      { key: 'confidence',
        value: false,
        kind: 'boolean',
        level: 'exercise',
      },
    ];

    let listSettingsStub = this.listSettingsStub = sinon.stub().returns(settings);

    // patch database API
    let createStub = this.createStub = sinon.stub().returns(fakeResolved());

    let updateSettingsStub = this.updateSettingsStub = sinon.stub().returns(fakeResolved());

    let findByIdStub = this.findByIdStub = sinon.stub().returns({
      exec: function() {
        return fakeResolved({
          listSettings: listSettingsStub,
          updateSettings: updateSettingsStub,
        });
      },
    });

    this.tagName = 'asq-exercise';

    this.asq = {
      registerHook: function() {},
      db: {
        model: function() {
          return {
            create: createStub,
            findById: findByIdStub,
          };
        },
      },
      api: {
        settings: {
          defaultSettings: {
            'exercise': this.settings,
          },
        },
      },
    };

    // load html fixtures
    this.simpleHtml = fs.readFileSync(require.resolve('./fixtures/simple.html'), 'utf-8');
    this.attributesHtml = fs.readFileSync(require.resolve('./fixtures/attributes.html'), 'utf-8');
    this.questionsHtml = fs.readFileSync(require.resolve('./fixtures/questions.html'), 'utf-8');

    this.asqExercisePlugin = require(modulePath);
  });

  describe('parseHtml', function() {
    before(function() {
     sinon.stub(this.asqExercisePlugin.prototype, 'processEl').returns({
      _id: 'test-id',
      stem: 'test-stem',
      questions: ['test-q-1', 'test-q-1'],
      assessmentTypes: ['test-assessment-type'],
     });

     let updateSettingsStub = this.updateSettingsStub = sinon.stub().returns(fakeResolved());
     sinon
      .stub(this.asqExercisePlugin.prototype, 'createNewExercise')
      .returns(fakeResolved({ updateSettings: updateSettingsStub }));

     sinon.stub(this.asqExercisePlugin.prototype, 'parseExerciseSettings').returns('res');
     sinon.stub(this.asqExercisePlugin.prototype, 'createExerciseSettings').returns('res');
     sinon.stub(this.asqExercisePlugin.prototype, 'writeSettings').returns('res');
    });

    beforeEach(function() {
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

    after(function() {
     this.asqExercisePlugin.prototype.processEl.restore();
     this.asqExercisePlugin.prototype.createNewExercise.restore();
     this.asqExercisePlugin.prototype.parseExerciseSettings.restore();
     this.asqExercisePlugin.prototype.createExerciseSettings.restore();
    });

    it('should retrieve the current slideshow settings', function(done) {
      this.asqEx.parseHtml({ html: this.simpleHtml, slideshow_id: 'test-id' })
      .then(function() {
        this.findByIdStub.calledOnce.should.equal(true);
        this.findByIdStub.calledWithExactly('test-id');
        this.listSettingsStub.calledOnce.should.equal(true);
        done();
      }.bind(this))
      .catch(function(err) {
        done(err);
      });
    });

    it('should call processEl() for all asq-exercise elements', function(done) {
      this.asqEx.parseHtml({ html: this.simpleHtml, slideshow_id: 'test-id' })
      .then(function() {
        this.asqEx.processEl.calledThrice.should.equal(true);
        done();
      }.bind(this))
      .catch(function(err) {
        done(err);
      });
    });

    it('should call createNewExercise() to create a new exercise', function(done) {
      this.asqEx.parseHtml({ html: this.simpleHtml, slideshow_id: 'test-id' })
      .then(function() {
        this.asqEx.createNewExercise.calledThrice.should.equal(true);
        this.asqEx.createNewExercise.calledWithExactly(
          'test-id', 'test-stem', ['test-q-1', 'test-q-1'], ['test-assessment-type']);
        done();
      }.bind(this))
      .catch(function(err) {
        done(err);
      });
    });

    it('should call parseExerciseSettings() to parse the settings of the element', function(done) {
      this.asqEx.parseHtml({ html: this.simpleHtml, slideshow_id: 'test-id' })
      .then(function() {
        this.asqEx.parseExerciseSettings.calledThrice.should.equal(true);
        done();
      }.bind(this))
      .catch(function(err) {
        done(err);
      });
    });

    it('should call createExerciseSettings() to create the settings for the db', function(done) {
      this.asqEx.parseHtml({ html: this.simpleHtml, slideshow_id: 'test-id' })
      .then(function() {
        this.asqEx.createExerciseSettings.calledThrice.should.equal(true);
        done();
      }.bind(this))
      .catch(function(err) {
        done(err);
      });
    });

    it('should call update the settings in the database', function(done) {
      this.asqEx.parseHtml({ html: this.simpleHtml, slideshow_id: 'test-id' })
      .then(function() {
        this.updateSettingsStub.calledThrice.should.equal(true);
        done();
      }.bind(this))
      .catch(function(err) {
        done(err);
      });
    });

    it('should call writeSettings() to write the resolved settings back to the element', function(done) {
      this.asqEx.parseHtml({ html: this.simpleHtml, slideshow_id: 'test-id' })
      .then(function() {
        this.asqEx.writeSettings.calledThrice.should.equal(true);
        done();
      }.bind(this))
      .catch(function(err) {
        done(err);
      });
    });

    it('should resolve with the correct object', function(done) {
      this.asqEx.parseHtml({ html: this.simpleHtml, slideshow_id: 'test-id' })
      .then(function(result) {
        expect(result).to.deep.equal({ html: this.simpleHtml, slideshow_id: 'test-id' });
        done();
      }.bind(this))
      .catch(function(err) {
        done(err);
      });
    });
  });

  describe('processEl', function() {
    before(function() {
     sinon.stub(this.asqExercisePlugin.prototype, 'parseQuestions').returns([]);
    });

    beforeEach(function() {
      this.asqEx = new this.asqExercisePlugin(this.asq);
      this.asqExercisePlugin.prototype.parseQuestions.reset();
    });

    after(function() {
     this.asqExercisePlugin.prototype.parseQuestions.restore();
    });

    it('should assign a uid to the exercise if there\'s not one', function() {
      let $ = cheerio.load(this.simpleHtml);

      // this doesn't have an id
      let el = $('#no-uid')[0];
      this.asqEx.processEl($, el);
      $(el).attr('uid').should.exist;
      $(el).attr('uid').should.not.equal('a-uid');

      // this already has one
      el = $('#uid')[0];
      this.asqEx.processEl($, el);
      $(el).attr('uid').should.exist;
      $(el).attr('uid').should.equal('a-uid');
    });

    it('should call parseQuestions()', function() {
      let $ = cheerio.load(this.simpleHtml);
      let el = $(this.tagName)[0];

      this.asqEx.processEl($, el);
      this.asqEx.parseQuestions.calledOnce.should.equal(true);
    });

    it('should parse the stem correctly', function() {
      let $ = cheerio.load(this.simpleHtml);
      let el = $(this.tagName)[0];

      let res = this.asqEx.processEl($, el);
      res.stem.should.equal('This is a stem');


      // test when there's no stem
      $(el).find('asq-stem').remove();
      res = this.asqEx.processEl($, el);
      res.stem.should.equal('');
    });

    it('should set `assessmentTypes` correctly', function() {
      let $ = cheerio.load(this.attributesHtml);

      let el = $('#no-assessment')[0];
      let result = this.asqEx.processEl($, el);
      expect(result.assessmentTypes).to.deep.equal([]);

      el = $('#assessment-empty')[0];
      result = this.asqEx.processEl($, el);
      expect(result.assessmentTypes).to.deep.equal([]);

      el = $('#assessment-one-value')[0];
      result = this.asqEx.processEl($, el);
      expect(result.assessmentTypes).to.deep.equal(['auto']);

       el = $('#assessment-multi-value')[0];
      result = this.asqEx.processEl($, el);
      expect(result.assessmentTypes).to.deep.equal(['auto', 'self', 'peer']);
    });
  });

  describe('parseQuestions', function() {
    beforeEach(function() {
      this.$ = cheerio.load(this.questionsHtml);
      this.asqEx = new this.asqExercisePlugin(this.asq);
      this.questionElementNames = [
        'asq-multi-choice-q',
        'asq-highlight-q',
        'asq-code-q',
        'asq-js-function-body-q',
        'asq-css-select-q',
      ];
    });

    it('should assign a uid to options that don\'t have one', function() {
      let el;

      el = this.$('#no-uids')[0];
      this.asqEx.parseQuestions(this.$, el, this.questionElementNames);
      this.$(el).find('asq-multi-choice-q').eq(0).attr('uid').should.exist;
      this.$(el).find('asq-highlight-q').eq(0).attr('uid').should.exist;

      el = this.$('#uids-ok')[0];
      this.asqEx.parseQuestions(this.$, el, this.questionElementNames);
      this.$(el).find('asq-code-q').eq(0).attr('uid').should.equal('uid-1');
      this.$(el).find('asq-js-function-body-q').eq(0).attr('uid').should.equal('uid-2');
    });

    it('should throw an error when there are more than questions with the same uid', function() {
      let el = this.$('#same-uids')[0];
      let bindedFn = this.asqEx.parseQuestions.bind(this.asqEx, this.$, el, this.questionElementNames);
      expect(bindedFn).to.throw(/An exercise cannot have two questions with the same uids/);
    });

    it('should return an array of uis', function() {
      let el = this.$('#uids-ok')[0];
      let result = this.asqEx.parseQuestions(this.$, el, this.questionElementNames);
      expect(result).to.deep.equal(['uid-1', 'uid-2']);
    });
  });

  describe('updateExerciseSettingsDB', function() {
    before(function() {
      this.asqEx = new this.asqExercisePlugin(this.asq);
    });

    beforeEach(function() {
      this.findByIdStub.reset();
      this.listSettingsStub.reset();
      this.updateSettingsStub.reset();
    });

    it('should call findById', function(done) {
      const setting = {
        'maxNumSubmissions': 3,
      };
      this.asqEx.updateExerciseSettingsDB('testExerciseId', setting)
        .then(function() {
          expect(this.findByIdStub.calledOnce).to.equal(true);
          expect(this.findByIdStub.calledWith('testExerciseId')).to.equal(true);
          done();
        }.bind(this));
    });

    it('should call listSettings', function(done) {
      const setting = {
        'maxNumSubmissions': 3,
      };
      this.asqEx.updateExerciseSettingsDB('testExerciseId', setting)
        .then(function() {
          expect(this.findByIdStub.calledOnce).to.equal(true);
          expect(this.findByIdStub.calledWith('testExerciseId')).to.equal(true);
          expect(this.listSettingsStub.calledOnce).to.equal(true);
          expect(this.listSettingsStub.calledWith()).to.equal(true);
          done();
        }.bind(this));
    });

    it('should call updateSettings', function(done) {
      const setting = {
        'maxNumSubmissions': 3,
      };
      this.asqEx.updateExerciseSettingsDB('testExerciseId', setting)
        .then(function() {
          expect(this.findByIdStub.calledOnce).to.equal(true);
          expect(this.findByIdStub.calledWith()).to.equal(true);
          expect(this.listSettingsStub.calledOnce).to.equal(true);
          expect(this.listSettingsStub.calledWith()).to.equal(true);
          expect(this.updateSettingsStub.calledOnce).to.equal(true);
          expect(this.updateSettingsStub.calledWith(this.settings)).to.equal(true);
          done();
        }.bind(this));
    });
  });

  describe('updateExerciseSettings', function() {
    before(function() {
      this.asqEx = new this.asqExercisePlugin(this.asq);
      this.findByIdStub.reset();
      this.listSettingsStub.reset();
    });

    beforeEach(function() {
      this.findByIdStub.reset();
      this.listSettingsStub.reset();
    });

    it('should call findById twice', function(done) {
      const option = {
        exercise_id: 'testExerciseId',
        html: 'someHtml',
        settings: {
          'maxNumSubmissions': 3,
        },
      };
      this.asqEx.updateExerciseSettings(option)
        .then(function() {
          expect(this.findByIdStub.calledTwice).to.equal(true);
          expect(this.findByIdStub.calledWith('testExerciseId')).to.equal(true);
          done();
        }.bind(this))
        .catch(function(err) {
          expect(err).to.be.undefined;
          done();
        });
    });

    it('should call listSettings once', function(done) {
      const option = {
        exercise_id: 'testExerciseId',
        html: 'someHtml',
        settings: {
          'maxNumSubmissions': 3,
        },
      };
      this.asqEx.updateExerciseSettings(option)
        .then(function() {
          expect(this.findByIdStub.calledTwice).to.equal(true);
          expect(this.findByIdStub.calledWith('testExerciseId')).to.equal(true);
          expect(this.listSettingsStub.calledOnce).to.equal(true);
          expect(this.listSettingsStub.calledWith()).to.equal(true);
          done();
        }.bind(this))
        .catch(function(err) {
          expect(err).to.be.undefined;
          done();
        });
    });

    it('should have returned the correct values', function(done) {
      const option = {
        exercise_id: 'testExerciseId',
        html: 'someHtml',
        settings: {
          'maxNumSubmissions': 3,
        },
      };

      const data = {
        exerciseId: option.exercise_id,
        html: option.html,
        settings: option.settings,
        status: 'success',
      };
      this.asqEx.updateExerciseSettings(option)
        .then(function(result) {
          expect(this.findByIdStub.calledTwice).to.equal(true);
          expect(this.findByIdStub.calledWith('testExerciseId')).to.equal(true);
          expect(this.listSettingsStub.calledOnce).to.equal(true);
          expect(this.listSettingsStub.calledWith()).to.equal(true);
          expect(result).to.deep.equal(data);
          done();
        }.bind(this))
        .catch(function(err) {
          expect(err).to.be.undefined;
          done();
        });
    });
  });

  describe('writeSettingsAsAttributesToGivenExercise', function() {
    before(function() {
      this.asqEx = new this.asqExercisePlugin(this.asq);
      sinon
        .stub(this.asqExercisePlugin.prototype, '_convertSettings2CheerioCompatible')
        .returns({ 'maxNumSubmissions': 3 });
    });

    let result;
    beforeEach(function() {
      result = this.asqEx.writeSettingsAsAttributesToGivenExercise(this.simpleHtml, 'testExerciseId', { 'maxNumSubmissions': 3 });
    });

    afterEach(function() {
      this.asqExercisePlugin.prototype._convertSettings2CheerioCompatible.reset();
    });

    after(function() {
      this.asqExercisePlugin.prototype._convertSettings2CheerioCompatible.restore();
    });

    it('should call _convertSettings2CheerioCompatible', function() {
      expect(this.asqEx._convertSettings2CheerioCompatible.calledOnce).to.be.equal(true);
    });

    it('should return the correct value', function() {
      expect(this.asqEx._convertSettings2CheerioCompatible.calledOnce).to.be.equal(true);
      expect(result).to.be.equal(this.simpleHtml);
    });
  });
  describe('_convertSettings2CheerioCompatible', function() {
    before(function() {
      this.asqEx = new this.asqExercisePlugin(this.asq);
    });

    it('should return the correct object if there are no boolean values', function() {
      const settings = { 'maxNumSubmissions': 3 };
      const result = this.asqEx._convertSettings2CheerioCompatible(settings);
      expect(result).to.deep.equal(settings);
    });

    it('should delete an entry if its value is false', function() {
      const settings = {
        'testFalseValue': false,
        'maxNumSubmissions': 3,
      };
      const result = this.asqEx._convertSettings2CheerioCompatible(settings);
      expect(result).to.deep.equal({ 'maxNumSubmissions': 3 });
    });

    it('should set the value of an entry to its key if the value is true', function() {
      const settings = {
        'testTrueValue': true,
        'maxNumSubmissions': 3,
      };
      const result = this.asqEx._convertSettings2CheerioCompatible(settings);
      expect(result).to.deep.equal({
        'testTrueValue': 'testTrueValue',
        'maxNumSubmissions': 3,
      });
    });
  });
  describe('createExerciseSettings', function() {
    before(function() {
      this.asqEx = new this.asqExercisePlugin(this.asq);
    });

    it('should return the correct exercise level settings', function() {
      const exerciseSettings = {
        'maxNumSubmissions': 0,
      };
      const presentationSettings = [{
        'key': 'maxNumSubmissions',
        'value': 3,
      }];
      const result = this.asqEx.createExerciseSettings(exerciseSettings, presentationSettings);
      const exerciseLevelSettings = this.settings;
      exerciseLevelSettings[0].value = 0;
      expect(result).to.deep.equal(exerciseLevelSettings);
    });
  });

  describe('createNewExercise', function() {
    before(function() {
      const data = {
        _id: 'testExerciseId',
        stem: 'simpleStem',
        questions: ['testQuestions'],
        settings: this.settings,
      };
      this.createStub.returns(fakeResolved(data));
      this.asqEx = new this.asqExercisePlugin(this.asq);
    });

    it('should return the correct exercise', function() {
      this.asqEx.createNewExercise('testExerciseId', 'simpleStem', ['testQuestions'], ['self'])
        .then(function(result) {
          const data = {
            _id: 'testExerciseId',
            stem: 'simpleStem',
            questions: ['testQuestions'],
            settings: this.settings,
          };
          expect(result).to.deep.equal(data);
        }.bind(this));
    });
  });
  describe('parseExerciseSettingsGivenId', function() {
    it.skip('should test this method');
  });
  describe('_fixBooleanAttributesFromCheerio', function() {
    it.skip('should test this method');
  });
  describe('_assureBooleanValFromHTMLBooleanAttr', function() {
    it.skip('should test this method');
  });
  describe('dashed2Camel', function() {
    it.skip('should test this method');
  });
  describe('camel2dashed', function() {
    it.skip('should test this method');
  });
  describe('parseExerciseSettings', function() {
    it.skip('should test this method');
  });
  describe('restorePresenterForSession', function() {
    it.skip('should test this method');
  });
  describe('presenterConnected', function() {
    it.skip('should test this method');
  });
  describe('restoreViewerForSession', function() {
    it.skip('should test this method');
  });
  describe('viewerConnected', function() {
    it.skip('should test this method');
  });
  describe('exerciseSubmission', function() {
    it.skip('should test this method');
  });
  describe('calculateProgress', function() {
    it.skip('should test this method');
  });
});
