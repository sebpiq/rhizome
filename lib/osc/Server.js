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

var _ = require('underscore')
  , async = require('async')
  , debug = require('debug')('rhizome.server.osc')
  , expect = require('chai').expect
  , coreMessages = require('../core/messages')
  , coreServer = require('../core/server')
  , coreValidation = require('../core/validation')
  , connections = require('../connections')
  , transport = require('./transport')


// Class to handle connections from OSC clients. 
var OSCConnection = function(args) {
  coreServer.Connection.call(this, args)
  this.ip = args[0]
  this.appPort = args[1]
  this.id = this.ip + ':' + this.appPort
  this.appClient = transport.createClient(this.ip, this.appPort, 'udp')
  this.appClient.on('error', (err) => this.emit('error', err))
}

_.extend(OSCConnection.prototype, coreServer.Connection.prototype, {
  
  namespace: 'osc',

  send: function(address, args) {
    if (this.blobClient && args.some((arg) => arg instanceof Buffer)) {
      debug(this.toString() + ' sending to blob client ' + address + ' ' + coreMessages.argsToString(args))
      args = [this.appPort].concat(args)
      this.blobClient.send(address, args)
    } else this.appClient.send(address, args)
  },

  onSysMessage: function(address, args) {
    // Change configuration of the client
    if (address === coreMessages.configureAddress) {
      var param = args[0]

      if (param === 'blobClient') {
        var blobsPort = args[1] || 44444
        this.setBlobClient(blobsPort)
        this.appClient.send(coreMessages.configuredAddress, [blobsPort])
        this.save()
      }

    // Receives the request to send a blob, first checks the address,
    // and then asks the blob client to send the requested blob
    } else if (this.blobClient && address === coreMessages.sendBlobAddress) {
      debug(this.toString() + ' asking blob client to send ' + coreMessages.argsToString(args))
      var originalAddress = args[0]
        , err = coreMessages.validateAddressForSend(originalAddress)
      if (err) this.appClient.send(coreMessages.errorAddress, [err])
      else this.blobClient.send(coreMessages.sendBlobAddress, args)

    } else coreServer.Connection.prototype.onSysMessage.apply(this, arguments)
  },

  setBlobClient: function(blobsPort) {
    this.infos.blobsPort = blobsPort
    this.blobClient = transport.createClient(this.ip, blobsPort, 'tcp')
    this.blobClient.on('error', (err) => {
      if (err.code === 'ECONNREFUSED')
        this.emit('error', new Error('blob client refused connection'))
      else this.emit('error', err)
    })
    debug(this.toString() + ' configured blob client to port ' + blobsPort)
  },

  // When deserializing the persisted connection, we need to restore blob client
  deserialize: function(data) {
    coreServer.Connection.prototype.deserialize.apply(this, arguments)
    if (this.infos.blobsPort) this.setBlobClient(this.infos.blobsPort)
  }
})


var OSCServer = module.exports = function(config) {
  coreServer.Server.call(this, config)
  this._server = null
  this._blobsServer = null
  this._config = config
}

_.extend(OSCServer.prototype, coreValidation.ValidateConfigMixin, coreServer.Server.prototype, {

  ConnectionClass: OSCConnection,

  start: function(done) {
    this.validateConfig((err) => {
      if (err) return done(err)
      coreServer.Server.prototype.start.apply(this)

      // This is the OSC server that receives normal messages
      this._server = transport.createServer(this._config.port, 'udp')
      this._server.on('message', this._onMessage.bind(this))
      this._server.on('error', (err) => this.emit('error', err))

      // This is the server on which we receive the blobs sent by the blob client.
      // When an app client wants to send a blob, it sends a message to the server, which then asks the
      // blob client to actually send the blob. That way the user never deals directly with the blob client :
      //    APP                this._server                     BLOB-CLIENT                  this._blobsServer
      //    sendBlobAddress ->
      //                    sendBlobAddress ->
      //                                           /some/address <blob>, <arg1>, <arg2>, ->
      this._blobsServer = transport.createServer(this._config.blobsPort, 'tcp')
      this._blobsServer.on('message', (address, args, rinfo) => connections.manager.send(address, args))
      this._blobsServer.on('error', (err) => this.emit('error', err))

      async.waterfall([
        this._server.start.bind(this._server),
        this._blobsServer.start.bind(this._blobsServer),
        connections.manager.listPersisted.bind(connections.manager, OSCConnection.prototype.namespace),

        // Immediately re-open OSC connections that were persisted. 
        // We need to do that because UDP OSC clients will not try to reconnect.
        (ids, next) => {
          async.each(ids, (id, nextId) => {
            var parts = id.split(':')
            this.openConnection([parts[0], parseInt(parts[1], 10)], nextId)
          }, next)
        }
      ], done)
    })
  },

  stop: function(done) {
    if (this._server) {
      async.series([
        this._server.stop.bind(this._server),
        this._blobsServer.stop.bind(this._blobsServer),
        (next) => coreServer.Server.prototype.stop.call(this, next)
      ], (err) => {
        this._server.removeAllListeners()
        this._blobsServer && this._blobsServer.removeAllListeners()
        this._server.on('error', () => {})
        this._blobsServer && this._blobsServer.on('error', () => {})
        this._server = null
        this._blobsServer = null
        done(err)
      })
    } else done()
  },

  configValidator: new coreValidation.ChaiValidator({
    blobsPort: function(val) {
      expect(val).to.be.a('number')
      expect(val).to.be.within(0, 65535)
    },
    port: function(val) {
      expect(val).to.be.a('number')
      expect(val).to.be.within(0, 65535)
    }
  }),

  configDefaults: {
    blobsPort: 44445
  },

  _onMessage: function (address, args, rinfo) {
    debug('message ' + address)

    // System messages should always have the appPort as first argument.
    if (coreMessages.sysAddressRe.exec(address)) {
      var appPort = args[0]
        , args = args.slice(1)
        , ip = rinfo.address
        , connection = this._findConnection(ip, appPort)

      // Quick port validation
      if (!_.isNumber(appPort) || appPort <= 0 || appPort >= 65536)
        return this.emit('error', new Error('Wrong sys message : "' + args + '" invalid port ' + appPort))
      // !!! We forbid to use the same port as rhizome server for osc clients. 
      // There is no problem when client is on a different machine, but if server and client
      // run on the same machine, the server will essentially send bogus messages to itself
      // and this will potentially lead to crashes that are hard to understand.
      if (appPort === this._config.port)
        return this.emit('error', new Error('Please keep port ' + appPort + ' reserved for the rhizome server'))

      // If connection doesn't exist, create it, open it and sends the sys message
      // once connection is open
      if (!connection) {
        this.openConnection([ip, appPort], (err, connection) => {
          if (err) return this.emit('error', err)
          connection.onSysMessage(address, args, rinfo)
        })
      } else connection.onSysMessage(address, args, rinfo)

    // If normal message, we traverse the namespaces from / to `address` and send to all sockets
    } else {
      var err = coreMessages.validateAddressForSend(address)
      if (err) debug('invalid address : ' + address + '(' + err + ')')
      else connections.manager.send(address, args)
    }
  },

  // Debug function for OSCServer
  debug: debug,

  _findConnection: function(ip, appPort) {
    return _.find(this.connections, (connection) => {
      return connection.ip === ip && connection.appPort === appPort
    })
  }

})