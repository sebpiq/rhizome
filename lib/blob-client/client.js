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
var fs = require('fs')
  , path = require('path')
  , _ = require('underscore')
  , async = require('async')
  , debug = require('debug')('rhizome.blob-client')
  , shared = require('../shared')
  , utils = require('../server/core/utils')
  , oscCore = require('../server/core/osc-core')

var receiveFromServer, sendToServer, sendToApps

exports.start = function(config, done) {
  debug('starting')
  // Make sure `blobsDirName` ends with no /
  if (_.last(config.blobsDirName) === '/')
    config.blobsDirName = config.blobsDirName.slice(0, -1) 

  // Listens messages coming from the server
  receiveFromServer = new oscCore.createOSCServer(config.blobsPort, 'tcp')

  // Client to send OSC back to the server
  sendToServer = new oscCore.createOSCClient(config.server.ip, config.server.blobsPort, 'tcp')

  // Send to the app (Pd, Processing, ...)
  sendToApps = {}

  receiveFromServer.on('message', function (address, args, rinfo) {
    debug('message ' + address + ' ' + shared.argsToString(args))
    // Opens the file and sends the blob to the server.
    // !!! For security reasons only files in `blobsDirName` can be sent.
    if (address === shared.sendBlobAddress) {
      var originalAddress = args[0]
        , filePath = args[1]
        , otherArgs = args.slice(2)
        
      if (path.dirname(filePath) === path.normalize(config.blobsDirName)) {
        fs.readFile(filePath, function(err, buf) {
          if (err) sendToServer.send(shared.errorAddress, [err])
          else sendToServer.send(originalAddress, [buf].concat(otherArgs))
        })
      } else sendToServer.send(shared.errorAddress, ['this path is not allowed ' + filePath])

    // Just save the blobs in `blobsDirName` and sends the same message to the app,
    // but with filenames instead of blobs.
    } else {
      debug('received blob at address \'' + address + '\'')
      async.parallel(args.map(function(arg) {
        if (arg instanceof Buffer)
          return function(next) { utils.saveBlob(config.blobsDirName, arg, next, config.fileExtension) }
        else return function(next) { next(null, arg) }
      }), function(err, args) {
        debug('blobs saved, args \'' + args + '\'')
        var appPort = args[0]
          , args = args.slice(1)
          , sendToApp = sendToApps[appPort]
        if (!sendToApp)
          sendToApp = sendToApps[appPort] = new oscCore.createOSCClient('127.0.0.1', appPort, 'udp')
        sendToApp.send(address, args)
      })
    }

  })

  receiveFromServer.start(done)
}

exports.stop = function(done) {
  if (receiveFromServer) { 
    debug('stopping')
    receiveFromServer.stop(function(err) {
      receiveFromServer = null
      done(err)
    })
  } else done()
}
