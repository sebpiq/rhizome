#!/usr/bin/env node
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

var path = require('path')
  , _ = require('underscore')
  , debug = require('debug')('rhizome.main')
  , client = require('../../lib/blob-client/client')
  , validateConfig = require('./validate-config')
  , utils = require('../utils')

if (process.argv.length !== 3) {
  console.log('usage : rhizome-blobs <config.js>')
  process.exit(1)
}

var configFilePath = path.join(process.cwd(), process.argv[2])

validateConfig(require(configFilePath), function(err, config, configErrors) {

  if (_.keys(configErrors).length) {
    utils.printConfigErrors(configErrors)
    process.exit(1)
  }

  client.start(config, function(err) {
    if (err) throw err
    console.log('----- rhizome client ready -----')
  })

})
