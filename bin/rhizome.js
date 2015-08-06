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
  , fs = require('fs')
  , _ = require('underscore')
  , debug = require('debug')('rhizome.main')
  , program = require('commander')
  , async = require('async')
  , express = require('express')
  , clc = require('cli-color')
  , expect = require('chai').expect
  , version = require('../package.json').version
  , websockets = require('../lib/websockets')
  , osc = require('../lib/osc')
  , connections = require('../lib/connections')
  , coreUtils = require('../lib/core/utils')
  , coreValidation = require('../lib/core/validation')
  , errors = require('../lib/core/errors')
  , utils = require('./utils')

var httpServer, wsServer, oscServer

console.log(clc.bold('rhizome ' + version) )

// Validation for the http section of the configuration
var httpValidator = new coreValidation.ChaiValidator({
  port: function(val) {
    expect(val).to.be.a('number')
    expect(val).to.be.within(0, 65535)
  },
  staticDir: function(val, doneDirName) {
    expect(val).to.be.a('string')
    val = this.staticDir = path.resolve(this.staticDir)
    // Make sure `staticDir` ends with no /
    if (_.last(val) === '/')
      val = this.staticDir = val.slice(0, -1)
    coreUtils.validateDirExists(val, doneDirName)
  }
})

// Function to validate a full config. Calls `done(err)` when done.
// If validation failed, `err` is `ValidationError`.
var validateConfig = exports.validateConfig = function(config, done) {
  var asyncValidOps = []
  
  // Build list of async validation operations to perform
  config.connections = config.connections || {}
  _.defaults(config.connections, connections.ConnectionManager.prototype.configDefaults)
  var connectionsValidator = connections.ConnectionManager.prototype.configValidator
  asyncValidOps.push(connectionsValidator.run.bind(connectionsValidator, config.connections))

  if (config.http) {
    asyncValidOps.push(httpValidator.run.bind(httpValidator, config.http))
  }

  if (config.websockets) {
    if (config.http) config.websockets.serverInstance = {}
    _.defaults(config.websockets, websockets.Server.prototype.configDefaults)
    var wsValidator = websockets.Server.prototype.configValidator
    asyncValidOps.push(wsValidator.run.bind(wsValidator, config.websockets))
  }

  if (config.osc) {
    _.defaults(config.osc, osc.Server.prototype.configDefaults)
    var oscValidator = osc.Server.prototype.configValidator
    asyncValidOps.push(oscValidator.run.bind(oscValidator, config.osc))
  }

  // Perform validation operations
  async.series(asyncValidOps, function(err, results) {
    if (err) return done(err)
    var prefixes = []

    // Build list of prefixes for validation errors
    prefixes.push('.connections')
    if (config.http) prefixes.push('.http')
    if (config.websockets) prefixes.push('.websockets')
    if (config.osc) prefixes.push('.osc')

    // Prefix validation errors, merge them and print them
    var merged = {}
    results.forEach(function(errors, i) {
      _.pairs(errors).forEach(function(p) {
        merged[prefixes[i] + p[0]] = p[1]
      })
    })
    
    if (_.keys(merged).length) done(new errors.ValidationError(merged))
    else done()
  })
}

// Code that will run if the module is main
if (require.main === module) {
  program
    .version(version)
    .parse(process.argv)

  if (process.argv.length !== 3) {
    console.log('usage : rhizome <config.js>')
    process.exit(1)
  }

  var config = require(path.join(process.cwd(), process.argv[2]))

  validateConfig(config, function(err) {
    utils.handleError(err)
    var packageRootPath = path.join(__dirname, '..')
      , buildDir = path.join(packageRootPath, 'build')
      , asyncStartOps = []
      , warningLog = []
      , successLog = []
      
    // Connection manager
    connections.manager = new connections.ConnectionManager(config.connections)
    asyncStartOps.push(connections.manager.start.bind(connections.manager))

    // HTTP server
    if (config.http) {
      asyncStartOps.push(function(next) {
        var app = express()
        httpServer = require('http').createServer(app)
        app.set('port', config.http.port)
        app.use(express.logger('dev'))
        app.use(express.bodyParser())
        app.use(express.methodOverride())
        app.use(app.router)
        app.use('/rhizome', express.static(buildDir))
        app.use('/', express.static(config.http.staticDir))

        httpServer.listen(app.get('port'), function() {
          successLog.push('HTTP server running at '
            + clc.bold('http://<serverIP>:' + config.http.port + '/') 
            + '\n    serving content from ' + clc.bold(config.http.staticDir)
          )
          next()
        })
      })
    } else
      warningLog.push('no http server')

    // Websocket server
    if (config.websockets) {
      asyncStartOps.push(websockets.renderClientBrowser.bind(websockets, buildDir))
      asyncStartOps.push(function(next) {
        if (config.http) config.websockets.serverInstance = httpServer
        wsServer = new websockets.Server(config.websockets)
        wsServer.start(function(err) {
          successLog.push('websockets server running on port '
            + clc.bold(config.http ? config.http.port : config.websockets.port))
          next(err)
        })
      })
    } else
      warningLog.push('no websockets server')

    // OSC server
    if (config.osc) {
      asyncStartOps.push(function(next) {
        oscServer = new osc.Server(config.osc)
        oscServer.start(function(err) {
          successLog.push('OSC server running on port ' + clc.bold(config.osc.port))
          next(err)
        })
      })
    } else
      warningLog.push('no osc server')

    // Start servers
    async.parallel(asyncStartOps, function(err) {
      if (err) throw err
      var count = 1
      warningLog.forEach(function(msg) {
        console.log(clc.yellow.bold('(!) ') + msg)
      })
      successLog.forEach(function(msg) {
        console.log(clc.green.bold('('+ (count++) +') ') + msg)
      })
    })


  })
}