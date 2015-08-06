/*
 * Copyright 2014-2015, Sébastien Piquemal <sebpiq@gmail.com>
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
  , ValidationError = require('../lib/core/errors').ValidationError

var printConfigErrors = exports.printConfigErrors = function(configError) {
  var count = 0
  console.error(clc.bold.red('Your configuration file is invalid'))
  _.pairs(configError.fields).forEach(function(p) {
    count++
    console.error(clc.bold.red('(' + count + ')'), clc.bold(p[0]), p[1])
  })
}

exports.handleError = function(err) {
  if (!err) return
  if (err instanceof ValidationError) {
    printConfigErrors(err)
    process.exit(1)
  } else throw err
} 