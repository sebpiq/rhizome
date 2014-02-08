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
  , debug = require('debug')('mmhl.app')
  , async = require('async')
  , express = require('express')
  , app = express()
  , server = require('http').createServer(app)
  , wsServer = require('./lib/server/websockets')
  , oscServer = require('./lib/server/osc')
  , config = require('./config')
  , buildDir = path.join(__dirname, 'build')

config.server.instance = server

app.set('port', config.server.port)
app.use(express.logger('dev'))
app.use(express.bodyParser())
app.use(express.methodOverride())
app.use(app.router)
app.use('/rhizome', express.static(buildDir))


// add some locals that we can use in the templates
app.locals.static = config.static


// Declare views
app.get('/trace', function(req, res) {
  res.render('trace', {
    config: JSON.stringify({})
  })
})


// Start servers
async.parallel([

  function(next) {
    async.waterfall([
      function(next) { fs.exists(buildDir, function(exists) { next(null, exists) }) },
      function(exists, next) {
        if (!exists) fs.mkdir(buildDir, next)
        else next()
      },
      function(next) {
        var grunt  = spawn('grunt')
        grunt.on('close', function (code, signal) {
          if (code === 0) next()
          else next(new Error('grunt terminated with error'))
        })
      }
    ])
  },

  function(next) {
    wsServer.start(config, next)
  },

  function(next) {
    oscServer.start(config, next)
  },

  function(next) {
    server.listen(app.get('port'), function() {
      debug('Express server listening on port ' + app.get('port'))
      next()
    })
  }

], function(err) {
  if (err) throw err
  debug('ready to roll')
})
