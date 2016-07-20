#!/usr/bin/env node
/*
 * Copyright 2014-2016, Sébastien Piquemal <sebpiq@gmail.com>
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
"use strict";

var path = require('path')
  , fs = require('fs')
  , _ = require('underscore')
  , debug = require('debug')('rhizome.main')
  , program = require('commander')
  , async = require('async')
  , express = require('express')
  , morgan = require('morgan')
  , serveStatic = require('serve-static')
  , clc = require('cli-color')
  , expect = require('chai').expect
  , version = require('../package.json').version
  , websockets = require('../lib/websockets')
  , osc = require('../lib/osc')
  , connections = require('../lib/connections')
  , coreUtils = require('../lib/core/utils')
  , coreValidation = require('../lib/core/validation')
  , starter = require('../lib/core/starter')
  , errors = require('../lib/core/errors')
  , utils = require('./utils')

console.log(clc.bold('rhizome ' + version) )

var HTTPServer = function(config) {
  this._config = config
  this._app = express()
  this._httpServer = require('http').createServer(this._app)
  this._app.set('port', this._config.port)
  this._app.use(morgan('combined', { skip: function (req, res) { return res.statusCode < 400 } }))
  this._app.use('/rhizome', serveStatic(buildDir))
  this._app.use('/', serveStatic(this._config.staticDir))
}

_.extend(HTTPServer.prototype, coreValidation.ValidateConfigMixin, {
  
  start: function(done) {
    this._httpServer.listen(this._app.get('port'), done)
  },

  configDefaults: {},
  configValidator: new coreValidation.ChaiValidator({
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

})

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
    , packageRootPath = path.join(__dirname, '..')
    , buildDir = path.join(packageRootPath, 'build')
    , warningLog = [], successLog = [], validationErrors = {}
    , allServers = _.groupBy(config.servers, 'type')
    , serverClasses = {
      'http': HTTPServer,
      'websockets': websockets.Server,
      'osc': osc.Server
    }
    , manager

  // Create the `ConnectionManager` instance, add a default connections manager if not defined
  manager = new connections.ConnectionManager(
    config.connections || _.clone(connections.ConnectionManager.prototype.configDefaults))

  // Create instances of servers 
  _.pairs(allServers).forEach(function(pair, i) {
    var type = pair[0]
      , servers = pair[1]
      , serverClass = serverClasses[type]
    
    if (!serverClass) {
      delete allServers[type]
      return validationErrors['servers.' + i] = 'invalid server type ' + type
    }

    servers.forEach(function(server, i) {
      servers[i] = new (serverClass)(server.config)
    })
  })

  // Combine HTTP and websockets servers that have the same port
  if (allServers.http && allServers.websockets) {
    _.chain(allServers.http.concat(allServers.websockets))
      .groupBy(function(server) { return server._config.port })
      .values()
      .forEach(function(servers) {
        if (servers.length > 1) {
          var httpServer = _.find(servers, function(server) { 
            return server instanceof serverClasses.http 
          })
          servers.forEach(function(server) {
            if (server instanceof serverClasses.websockets)
              server._config.serverInstance = httpServer._httpServer
          })
        }
      }).value()
  }

  async.series([
    websockets.renderClientBrowser.bind(websockets, buildDir),
    starter.bind(starter, manager, _.chain(allServers).values().flatten().value())
  ], function(err) {
    // combine into existing ValidationError, or create a new ValidationError
    if (err && err instanceof errors.ValidationError)
      err = new errors.ValidationError(_.extend(validationErrors, err.fields))
    else if (_.keys(validationErrors).length)
      err = new errors.ValidationError(validationErrors)
    utils.handleError(err)

    // Print a warning if a server type has no instance defined
    _.keys(serverClasses).forEach(function(type) {
      if (!allServers[type]) warningLog.push('no ' + type + ' server')  
    })

    warningLog.forEach(function(msg) { utils.logWarning(msg) })

    // Logs each instance of server created
    ;(allServers.http || []).forEach(function(server) {
      successLog.push('HTTP server running at '
        + clc.bold('http://<serverIP>:' + server._config.port + '/') 
        + '\n    serving content from ' + clc.bold(server._config.staticDir)
      )
    })

    ;(allServers.websockets || []).forEach(function(server) {
      successLog.push('websockets server running on port ' + clc.bold(server._config.port))
    })

    ;(allServers.osc || []).forEach(function(server) {
      successLog.push('OSC server running on port ' + clc.bold(server._config.port))
    })

    successLog.forEach(function(msg) { utils.logSuccess(msg) })

  })
}