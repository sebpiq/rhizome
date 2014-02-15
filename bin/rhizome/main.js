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
  , async = require('async')
  , express = require('express')
  , wsServer = require('../../lib/server/websockets')
  , oscServer = require('../../lib/server/osc')

// TODO ; oscClient.port !== desktopClient.port AND server.port !== desktopClient.port
var validateConfig = function(config) {
  if (config.server.port === config.desktopClient.port) {}


  _.extend(config, {

    server: {

      // The host on which rhizome runs
      ip: '127.0.0.1',

      // Directory where blobs received from the web client are saved
      blobsDirName: '/tmp',

      // The port on which the html pages will be served, as well as websocket requests
      webPort: 8000,

      // The port on which the server will receive OSC messages
      oscPort: 9000,

      // The maximum amount of users accepted simultaneously
      usersLimit: 40,

      // The pages that the server should serve. Example :
      // [
      //    { rootUrl: '/bananas', dirName: './bananas_files' },
      //    { rootUrl: '/oranges', dirName: './oranges_files' }
      // ]
      pages: [],

      // The root of the rhizome application on the server
      rootUrl: '/'
    },

    clients: [

      // A list of OSC clients to transmit user messages to. Valid argument for each client is : 
      //    - <ip> : the IP address of the client
      //    - <oscPort> : the port on which the application (Pd, Processing, ...) will receive OSC messages
      //    - <desktopClientPort> : the port on which the desktop client will receive OSC messages

    ]

  })


}

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
  , config = {}
require('./default-config.js')(config)
require(configFilePath)(config)
config.server.instance = server

app.set('port', config.server.webPort)
app.use(express.logger('dev'))
app.use(express.bodyParser())
app.use(express.methodOverride())
app.use(app.router)
app.use('/rhizome', express.static(buildDir))

// Serve the users pages
config.server.pages.forEach(function(page) {
  if (page.rootUrl.search('/rhizome.*') !== -1)
    throw new Error(' the page with url \'/rhizome\' is reserved')
  var dirName = path.join(process.cwd(), page.dirName)
  app.use(page.rootUrl, express.static(dirName))
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
  console.log('----- rhizome ready -----')
})
