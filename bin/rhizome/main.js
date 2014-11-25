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
  , _ = require('underscore')
  , debug = require('debug')('rhizome.main')
  , program = require('commander')
  , version = require('../../package.json').version
  , async = require('async')
  , express = require('express')
  , clc = require('cli-color')

  , websockets = require('../../lib/websockets')
  , osc = require('../../lib/osc')
  , validateConfig = require('./validate-config')
  , utils = require('../utils')

program
  .version(version)
  .parse(process.argv)

if (process.argv.length !== 3) {
  console.log('usage : rhizome <config.js>')
  process.exit(1)
}

var app = express()
  , server = require('http').createServer(app)
  , packageRootPath = path.join(__dirname, '..', '..')
  , buildDir = path.join(packageRootPath, 'build')
  , configFilePath = path.join(process.cwd(), process.argv[2])

validateConfig(require(configFilePath), function(err, config, configErrors) {

  var wsServer = new websockets.Server()
    , oscServer = new osc.Server()

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

    websockets.renderClientBrowser.bind(websockets, buildDir),
    wsServer.start.bind(wsServer, config),
    oscServer.start.bind(oscServer, config),

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
  })

})
