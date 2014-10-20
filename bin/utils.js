/*
 * Copyright 2014, Sébastien Piquemal <sebpiq@gmail.com>
 *
 * rhizome is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * rhizome is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with rhizome.  If not, see <http://www.gnu.org/licenses/>.
 */
var fs = require('fs')
  , _ = require('underscore')
  , async = require('async')
  , chai = require('chai')
  , clc = require('cli-color')

exports.printConfigErrors = function(configErrors) {
  var count = 0
  console.log(clc.bold.red('Your configuration file is invalid'))
  _.pairs(configErrors).forEach(function(p) {
    count++
    console.log(clc.bold.red('(' + count + ')'), clc.bold(p[0]), p[1])
  })
}

// Validates the object `obj`, by running all `validators` `{attrName: func(val[, done])}` on it.
// Validation errors are then stored in `validationErrors` object.
// The path of unvalid attributes is constructed by appending the name of the unvalid 
// attribute to `prefix`.
// `beforeAfter` contain hooks `before()`, `after()` and `done(err, obj, validationErrors)`
var validateObject = exports.validateObject = function(prefix, obj, validationErrors, beforeAfter, validators) {
  var asyncValid = []
    , isValid = true

  var _handleError = function(err) {
    if (err instanceof chai.AssertionError) {
      validationErrors[prefix] = err.message
      isValid = false
    } else throw err
  }

  var _doFinally = function() {
    var unknownAttrs = _.difference(_.keys(obj), _.keys(validators))
    if (unknownAttrs.length)
      _handleError(new chai.AssertionError('unknown attributes [' + unknownAttrs.join(', ') + ']'))
    if (isValid && beforeAfter.after) {
      try { beforeAfter.after.call(obj) } catch (err) { _handleError(err) }
    }
    if (beforeAfter.done) beforeAfter.done(null, obj, validationErrors)
  }

  // Run the `before` hook
  if (beforeAfter.before) {
    try { beforeAfter.before.call(obj) } catch (err) {
      _handleError(err)
      _doFinally()
      return
    }
  }

  // Run validators for all attributes
  async.series(_.pairs(validators).map(function(p) {
    var attrName = p[0]
      , func = p[1]
      , val = obj[attrName]
    return validate.bind(obj, prefix + '.' + attrName, validationErrors, val, func)
  }), function(err, results) {
    if (err) return _handleError(err)
    if (_.some(results, function(r) { return r !== null })) isValid = false
    _doFinally()
  })
}

// Validates `val` and if validation error, store it to `validationErrors[prefix]`
// The validator is `func(val[, done])`.
// Once the validation is finished, `done(err, validationErr)` is called.
var validate = exports.validate = function(prefix, validationErrors, val, func, done) {

  var _handleError = function(err) {
    if (err instanceof chai.AssertionError) {
      validationErrors[prefix] = err.message
      if (done) done(null, err)
    } else if (done) done(err, null)
    else throw err
  }

  // Both async and sync validation, in case calling the function directly throws an error.
  // For asynchronous validation, errors are returned as the first argument of the callback.
  if (func.length === 2) {
    try {
      func.call(this, val, function(err) {
        if (err) _handleError(err)
        else if (done) done(null, null)
      })
    } catch (err) { _handleError(err) }

  // Synchronous validation only
  } else {
    try {
      func.call(this, val)
      if (done) done(null, null)
    }
    catch (err) { _handleError(err) }
  }
}
