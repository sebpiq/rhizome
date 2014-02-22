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
  , clc = require('cli-color');

exports.printConfigErrors = function(configErrors) {
  var count = 0
  console.log(clc.bold.red('Your configuration file is invalid'))
  _.pairs(configErrors).forEach(function(p) {
    count++
    console.log(clc.bold.red('(' + count + ')'), clc.bold(p[0]), p[1])
  })
}

var validate = exports.validate = function(prefix, obj, validationErrors, beforeAfter, validators) {
  var asyncValid = []
    , isValid = true

  var _handleError = function(err, attrName) {
    if (err instanceof chai.AssertionError) {
      if (attrName) validationErrors[prefix + '.' + attrName] = err.message
      else validationErrors[prefix] = err.message
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

  if (beforeAfter.before) {
    try { beforeAfter.before.call(obj) } catch (err) {
      _handleError(err)
      _doFinally()
      return
    }
  }

  _.pairs(validators).forEach(function(p) {
    var attrName = p[0]
      , func = p[1]
      , val = obj[attrName]

    // Both asynchronous and synchronous validation.
    // For asynchronous validation, validation errors are returned as the first argument of the callback.
    if (func.length === 2) {
      asyncValid.push(function(next) {
        try {
          func.call(obj, val, function(err) {
            if (err) _handleError(err, attrName)
            next()
          })
        } catch (err) {
          _handleError(err, attrName)
          next()
        }
      })

    // Synchronous validation only
    } else {
      try { func.call(obj, val) }
      catch (err) { _handleError(err, attrName) }
    }

  })

  if (asyncValid.length) {
    async.series(asyncValid, function(err) {
      _doFinally()
    })
  } else _doFinally()
}
