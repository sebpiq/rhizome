var assert = require('assert')
  , _ = require('underscore')
  , utils = require('../../bin/utils')

describe('bin.utils', function() {

  describe('validate', function() {

    it('should return a validation error if unknown fields', function() {
      var validationErrors = {}
        , obj = {attr1: 'bla', unknown1: 1234, unknown2: 5678}
      utils.validate('root', obj, validationErrors, {}, {
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