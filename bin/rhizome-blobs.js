#!/usr/bin/env node
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
var path = require('path')
  , _ = require('underscore')
  , clc = require('cli-color')
  , program = require('commander')
  , debug = require('debug')('rhizome.blob-client')
  , version = require('../package.json').version  
  , BlobClient = require('../lib/osc/BlobClient')
  , utils = require('./utils')

console.log(clc.bold('rhizome-blobs ' + version) )

if (require.main === module) {
  program
    .version(version)
    .parse(process.argv)

  if (process.argv.length !== 3) {
    console.log('usage : rhizome-blobs <config.js>')
    process.exit(1)
  }

  var client = new BlobClient(require(path.join(process.cwd(), process.argv[2])))
  client.start(function(err) {
    utils.handleError(err)
    console.log(clc.bold.green('(*)'), 'saving and reading blobs from', clc.bold(client._config.blobsDir))
    console.log(clc.bold.green('(*)'), 'receiving blobs on port', clc.bold(client._config.blobsPort))
    console.log(clc.bold.green('(*)'), 'server',
      clc.italic('host=' + clc.bold(client._config.serverHostname)
        + ', blobsPort=' + clc.bold(client._config.serverBlobsPort)))
  })
}