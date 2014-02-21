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

// TODO ; oscClient.port !== blobClient.port AND server.port !== blobClient.port
var validateConfig = function(config) {
  if (config.server.port === config.blobClient.port) {}
}

if (process.argv.length !== 3) {
  console.log('usage : rhizome-blobs <config.js>')
  process.exit(1)
}

var configFilePath = path.join(process.cwd(), process.argv[2])
  , config = {}
require('./default-config.js')(config)
require(configFilePath)(config)

client.start(config, function(err) {
  if (err) throw err
  console.log('----- rhizome client ready -----')
})


