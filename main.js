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
  , wsServer = require('./lib/server/websockets')
  , oscServer = require('./lib/server/osc')

if (process.argv.length !== 3) {
  console.log('usage : rhizome <config.js>')
  process.exit(1)
}

var app = express()
  , server = require('http').createServer(app)
  , buildDir = path.join(__dirname, 'build')
  , gruntExecPath = path.join(__dirname, 'node_modules', 'grunt-cli', 'bin', 'grunt')
  , gruntFilePath = path.join(__dirname, 'Gruntfile.js')
  , configFilePath = path.join(process.cwd(), process.argv[2])
  , config = {}
require('./default-config.js')(config)
require(configFilePath)(config)
config.server.instance = server

app.set('port', config.server.port)
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
