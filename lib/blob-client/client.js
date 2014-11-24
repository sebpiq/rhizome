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
  , moscow = require('moscow')
  , debug = require('debug')('rhizome.blob-client')
  , coreMessages = require('../core/messages')
  , coreUtils = require('../core/utils')

var receiveFromServer, sendToServer, sendToApps

exports.start = function(config, done) {
  debug('starting')
  // Make sure `blobsDirName` ends with no /
  if (_.last(config.blobsDirName) === '/')
    config.blobsDirName = config.blobsDirName.slice(0, -1) 

  // Listens messages coming from the server
  receiveFromServer = new moscow.createServer(config.blobsPort, 'tcp')
  receiveFromServer.on('error', serverErrorHandler)

  // Client to send OSC back to the server
  sendToServer = new moscow.createClient(config.server.ip, config.server.blobsPort, 'tcp')
  sendToServer.on('error', clientErrorHandler)

  // Send to the app (Pd, Processing, ...)
  sendToApps = {}

  receiveFromServer.on('message', function (address, args, rinfo) {
    debug('message ' + address + ' ' + coreMessages.argsToString(args))
    // Opens the file and sends the blob to the server.
    // !!! For security reasons only files in `blobsDirName` can be sent.
    if (address === coreMessages.sendBlobAddress) {
      var originalAddress = args[0]
        , filePath = args[1]
        , otherArgs = args.slice(2)
        
      if (path.dirname(filePath) === path.normalize(config.blobsDirName)) {
        fs.readFile(filePath, function(err, buf) {
          if (err) sendToServer.send(coreMessages.errorAddress, [err])
          else sendToServer.send(originalAddress, [buf].concat(otherArgs))
        })
      } else sendToServer.send(coreMessages.errorAddress, ['this path is not allowed ' + filePath])

    // Just save the blobs in `blobsDirName` and sends the same message to the app,
    // but with filenames instead of blobs.
    } else {
      debug('received blob at address \'' + address + '\'')
      async.parallel(args.map(function(arg) {
        if (arg instanceof Buffer)
          return function(next) { coreUtils.saveBlob(config.blobsDirName, arg, next, config.fileExtension) }
        else return function(next) { next(null, arg) }
      }), function(err, args) {
        debug('blobs saved, args \'' + args + '\'')
        var appPort = args[0]
          , args = args.slice(1)
          , sendToApp = sendToApps[appPort]
        if (!sendToApp) {
          sendToApp = sendToApps[appPort] = new moscow.createClient('127.0.0.1', appPort, 'udp')
          sendToApp.on('error', clientErrorHandler)
        }
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

var clientErrorHandler = function(err) {
  if (err.code === 'ECONNRESET') console.error('Client lost the connection')
  else console.error(err)
}

var serverErrorHandler = function(err) {
  console.error(err)
}