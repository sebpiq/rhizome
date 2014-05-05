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
  , fs = require('fs')
  , spawn = require('child_process').spawn
  , _ = require('underscore')
  , debug = require('debug')('rhizome.main')
  , program = require('commander')
  , version = require('../../package.json').version
  , async = require('async')
  , express = require('express')
  , clc = require('cli-color')
  , wsServer = require('../../lib/server/websockets')
  , oscServer = require('../../lib/server/osc')
  , validateConfig = require('./validate-config')
  , utils = require('../utils')

program
  .version(version)
  .parse(process.argv);

if (process.argv.length !== 3) {
  console.log('usage : rhizome <config.js>')
  process.exit(1)
}

var app = express()
  , server = require('http').createServer(app)
  , packageRootPath = path.join(__dirname, '..', '..')
  , buildDir = path.join(packageRootPath, 'build')
  , gruntExecPath = path.join(packageRootPath, 'node_modules', 'grunt-cli', 'bin', 'grunt')
  , gruntFilePath = path.join(packageRootPath, 'Gruntfile.js')
  , configFilePath = path.join(process.cwd(), process.argv[2])

validateConfig(require(configFilePath), function(err, config, configErrors) {

  if (_.keys(configErrors).length) {
    utils.printConfigErrors(configErrors)
    process.exit(1)
  }

  config.serverInstance = server

  app.set('port', config.webPort)
  app.use(express.logger('dev'))
  app.use(express.bodyParser())
  app.use(express.methodOverride())
  app.use(app.router)
  app.use('/rhizome', express.static(buildDir))

  // Serve the users pages
  config.pages.forEach(function(page) {
    if (page.rootUrl.search('/rhizome.*') !== -1)
      throw new Error(' the page with url \'/rhizome\' is reserved')
    app.use(page.rootUrl, express.static(page.dirName))
  })

  // Start servers
  async.parallel([

    function(next) {
      async.waterfall([
        function(next2) { fs.exists(buildDir, function(exists) { next2(null, exists) }) },
        function(exists, next2) {
          if (!exists) fs.mkdir(buildDir, next2)
          else next2()
        },
        function(next2) {
          var grunt  = spawn(gruntExecPath, ['--gruntfile', gruntFilePath])
          grunt.on('close', function (code, signal) {
            if (code === 0) next2()
            else next2(new Error('grunt terminated with error'))
          })
        }
      ], next)
    },

    function(next) { wsServer.start(config, next) },

    function(next) { oscServer.start(config, next) },

    function(next) {
      server.listen(app.get('port'), function() {
        debug('Express server listening on port ' + app.get('port'))
        next()
      })
    }

  ], function(err) {
    if (err) throw err
    console.log(clc.bold('Rhizome ' + version +' running.') )
    console.log(clc.bold('(1)'), 'server listening for OSC messages on port', clc.bold(config.oscPort))

    if (config.pages.length) {
      console.log(clc.bold('(2)'), 'pages served at')
      config.pages.forEach(function(page) {
        console.log(clc.italic('  http://<serverIP>:' + config.webPort + clc.bold(page.rootUrl)))
      })
    } else console.log(clc.bold('(2) Warning : no web pages declared'))

    if (config.clients.length) {
      console.log(clc.bold('(3)'), 'sending to client applications at')
      config.clients.forEach(function(client) {
        console.log(clc.italic('  IP=' + clc.bold(client.ip) + ', appPort=' + clc.bold(client.appPort)
          + (client.useBlobClient ? ', blobsPort=' + clc.bold(client.blobsPort) : '')))
      })
    } else console.log(clc.bold('(3) Warning : no OSC clients declared'))
  })

})
