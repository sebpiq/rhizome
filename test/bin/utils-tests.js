var assert = require('assert')
  , _ = require('underscore')
  , chai = require('chai')
  , expect = chai.expect
  , utils = require('../../bin/utils')
  , ValidationError = require('../../lib/core/errors').ValidationError

describe('bin.utils', function() {

  describe('printConfigErrors', function() {

    it('should not crash', function() {
      console.log('DO NOT PANIC : this is just a test')
      utils.printConfigErrors(new ValidationError({bla: 'just a test, do not panic'}))
    })

  })

})