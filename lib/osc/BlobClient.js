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
var fs = require('fs')
  , path = require('path')
  , _ = require('underscore')
  , async = require('async')
  , expect = require('chai').expect
  , debug = require('debug')('rhizome.blob-client')
  , coreMessages = require('../core/messages')
  , coreUtils = require('../core/utils')
  , coreValidation = require('../core/validation')
  , transport = require('./transport')


var Client = module.exports = function(config) {
  this._config = config
}


_.extend(Client.prototype, coreValidation.ValidateConfigMixin, {

  start: function(done) {
    var self = this
    debug('starting')

    this.validateConfig(function(err) {
      if (err) return done(err)

      // Client to send OSC back to the server
      self._sendToServer = new transport.createClient(self._config.serverHostname,
        self._config.serverBlobsPort, 'tcp')
      self._sendToServer.on('error', clientErrorHandler)

      // Send to the app (Pd, Processing, ...)
      self._sendToApps = {}

      // Listens messages coming from the server
      self._receiveFromServer = new transport.createServer(self._config.blobsPort, 'tcp')
      self._receiveFromServer.on('error', serverErrorHandler)
      self._receiveFromServer.on('message', self._onMessage.bind(self))
      self._receiveFromServer.start(done)
    })
  },

  stop: function(done) {
    var self = this
    if (this._receiveFromServer) { 
      debug('stopping')
      this._receiveFromServer.stop(function(err) {
        self._receiveFromServer = null
        done(err)
      })
    } else done()
  },

  configValidator: new coreValidation.ChaiValidator({
    blobsDir: function(val, doneDirName) {
      expect(val).to.be.a('string')
      val = this.blobsDir = path.resolve(this.blobsDir)
      // Make sure `blobsDir` ends with no /
      if (_.last(val) === '/')
        val = this.blobsDir = val.slice(0, -1)
      coreUtils.validateDirExists(val, doneDirName)
    },
    blobsPort: function(val) {
      expect(val).to.be.a('number')
      expect(val).to.be.within(0, 65535)
    },
    serverBlobsPort: function(val) {
      expect(val).to.be.a('number')
      expect(val).to.be.within(0, 65535)
    },
    serverHostname: function(val) {
      expect(val).to.be.an.ip
    },
    fileExtension: function(val) {
      if (val !== undefined)
        expect(val).to.be.a('string')
    }
  }),

  configDefaults: {
    blobsPort: 44444,
    serverHostname: 'localhost',
    serverBlobsPort: 44445
  },

  _onMessage: function (address, args, rinfo) {
    var self = this
    debug('message ' + address + ' ' + coreMessages.argsToString(args))
    // Opens the file and sends the blob to the server.
    // !!! For security reasons only files in `blobsDir` can be sent.
    if (address === coreMessages.sendBlobAddress) {
      var originalAddress = args[0]
        , filePath = args[1]
        , otherArgs = args.slice(2)
        
      if (path.dirname(filePath) === path.normalize(this._config.blobsDir)) {
        fs.readFile(filePath, function(err, buf) {
          if (err) self._sendToServer.send(coreMessages.errorAddress, [err])
          else self._sendToServer.send(originalAddress, [buf].concat(otherArgs))
        })
      } else this._sendToServer.send(coreMessages.errorAddress, ['this path is not allowed ' + filePath])

    // Just save the blobs in `blobsDir` and sends the same message to the app,
    // but with filenames instead of blobs.
    } else {
      debug('received blob at address \'' + address + '\'')
      async.parallel(args.map(function(arg) {
        if (arg instanceof Buffer) {
          return function(next) {
            coreUtils.saveBlob(self._config.blobsDir, arg, next, self._config.fileExtension)
          }
        } else return function(next) { next(null, arg) }
      }), function(err, args) {
        debug('blobs saved, args \'' + args + '\'')
        var appPort = args[0]
          , args = args.slice(1)
          , sendToApp = self._sendToApps[appPort]
        if (!sendToApp) {
          sendToApp = self._sendToApps[appPort] = new transport.createClient('127.0.0.1', appPort, 'udp')
          sendToApp.on('error', clientErrorHandler)
        }
        sendToApp.send(address, args)
      })
    }
  }

})


var clientErrorHandler = function(err) {
  if (err.code === 'ECONNRESET') console.error('Client lost the connection')
  else console.error(err)
}

var serverErrorHandler = function(err) {
  console.error(err)
}