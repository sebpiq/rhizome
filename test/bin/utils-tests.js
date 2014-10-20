var assert = require('assert')
  , _ = require('underscore')
  , chai = require('chai')
  , expect = chai.expect
  , utils = require('../../bin/utils')

describe('bin.utils', function() {

  describe('validate', function() {

    it('shouldnt do anything if sync validation succeeds', function(done) {
      validationErrors = {}
      utils.validate('root.a.b', validationErrors, 1234, function(val) {
      }, function(err) {
        if (err) throw err
        assert.deepEqual(_.keys(validationErrors), [])
        done()
      })
    })

    it('shouldnt do anything if async validation succeeds', function(done) {
      validationErrors = {}
      utils.validate('root.a.b', validationErrors, 1234, function(val, done) {
        done()
      }, function(err) {
        if (err) throw err
        assert.deepEqual(_.keys(validationErrors), [])
        done()
      })
    })

    it('should catch synchronous chai.AssertionErrors', function(done) {
      validationErrors = {}
      utils.validate('root.a.b', validationErrors, 1234, function(val) {
        assert.equal(val, 1234)
        expect(val).to.be.equal(null) // throws an AssertionError
      }, function(err) {
        if (err) throw err
        assert.deepEqual(_.keys(validationErrors), ['root.a.b'])
        done()
      })
    })

    it('should catch asynchronous chai.AssertionErrors', function(done) {
      validationErrors = {}
      utils.validate('root.a.b', validationErrors, 1234, function(val, done) {
        assert.equal(val, 1234)
        done(new chai.AssertionError('dummy')) // throws an AssertionError
      }, function() {
        assert.deepEqual(validationErrors, {'root.a.b': 'dummy'})
        done()
      })
    })

    it('should catch synchronous chai.AssertionErrors with `func` declared as async', function(done) {
      validationErrors = {}
      utils.validate('root.a.b', validationErrors, 1234, function(val, done) {
        assert.equal(val, 1234)
        expect(val).to.be.equal(null) // throws an AssertionError
      }, function() {
        assert.deepEqual(_.keys(validationErrors), ['root.a.b'])
        done()
      })
    })

  })

  describe('validateObject', function() {

    it('should collect sync and async validation errors', function(done) {
      var validationErrors = {}
        , obj = {attr1: 'bla', attr2: ''}

      var checkValidationErrors = function() {
        assert.deepEqual(_.keys(validationErrors), ['root.attr1', 'root.attr2'])
        done()
      }

      utils.validateObject('root', obj, validationErrors, { done: checkValidationErrors }, {
        attr1: function(val) { expect(val).to.be.equal(1) },
        attr2: function(val, done) { done(new chai.AssertionError('dummy')) }
      })
    })

    it('should return a validation error if unknown fields', function() {
      var validationErrors = {}
        , obj = {attr1: 'bla', unknown1: 1234, unknown2: 5678}
      utils.validateObject('root', obj, validationErrors, {}, {
        attr1: function(val) {},
        attr2: function(val) {}
      })
      assert.deepEqual(_.keys(validationErrors), ['root'])
    })

  })

  describe('printConfigErrors', function() {

    it('should not crash', function() {
      console.log('DO NOT PANIC : this is just a test')
      utils.printConfigErrors({bla: 'just a test, do not panic'})
    })

  })



})