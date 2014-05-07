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
  , debug = require('debug')('rhizome-blobs.main')
  , program = require('commander')
  , version = require('../../package.json').version  
  , clc = require('cli-color')
  , client = require('../../lib/blob-client/client')
  , validateConfig = require('./validate-config')
  , utils = require('../utils')

program
  .version(version)
  .parse(process.argv);

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
    console.log(clc.bold('Rhizome blobs ' + version + ' running.'))
    console.log(clc.bold('(1)'), 'saving and reading blobs from', clc.bold(config.blobsDirName))
    console.log(clc.bold('(2)'), 'receiving blobs on port', clc.bold(config.blobsPort))
    console.log(clc.bold('(3)'), 'application client running on same machine, osc port', clc.bold(config.appPort))
    console.log(clc.bold('(4)'), 'server', clc.italic('IP=' + clc.bold(config.server.ip) + ', blobsPort=' + clc.bold(config.server.blobsPort)))
  })

})
