"use strict";
var assert = require('assert')
  , _ = require('underscore')
  , async = require('async')
  , ValidationError = require('../lib/core/errors').ValidationError

// Helper for asynchronous tests, waiting for `expectedCount` answers and then calling `done`
var waitForAnswers = exports.waitForAnswers = function(expectedCount, done) {
  var received = []
  return function () {
    received.push(_.toArray(arguments))
    if (received.length >= expectedCount) done(received)
  }
}

// Helper to assert that 2 arrays contain the same elements (using deepEqual)
exports.assertSameElements = function(arr1, arr2) {
  var sorted1 = _.sortBy(arr1, _sortFunc)
    , sorted2 = _.sortBy(arr2, _sortFunc)
  assert.deepEqual(sorted1, sorted2)
}
var _sortFunc = function(obj) {
  var vals = obj
  if (_.isObject(obj)) {
    vals = _.chain(obj).pairs()
      .sortBy(function(p) { return p[0] })
      .pluck(1).value()
  }
  return vals.map(function(v) { return v === null ? 'null' : v.toString() }).join('')
}

var assertValidationError = exports.assertValidationError = function(err, expected) {
  if (!(err instanceof ValidationError)) throw new Error('Expected ValidationError, got :' + err)
  var actual = _.keys(err.fields)
  actual.sort()
  expected.sort()
  assert.deepEqual(actual, expected)
}

exports.assertConfigErrors = function(testList, done) {
  async.forEach(testList, function(p, next) {
    var obj = p[0]
      , expected = p[1]
    obj.start(function(err) {
      assertValidationError(err, expected)
      next()
    })
  }, done)
}