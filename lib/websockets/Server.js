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

var parseUrl = require('url').parse
  , _ = require('underscore')
  , async = require('async')
  , debug = require('debug')('rhizome.server.websocket')
  , WebSocket = require('ws')
  , expect = require('chai').expect
  , oscMin = require('osc-min')
  , coreServer = require('../core/server')
  , connections = require('../connections')
  , coreUtils = require('../core/utils')
  , coreValidation = require('../core/validation')
  , coreMessages = require('../core/messages')


// Class to handle connections from websocket clients.
var WebSocketConnection = function(args) {
  coreServer.Connection.call(this, args)
  var id = args[0]
    , os = args[1]
    , browser = args[2]

  // Save os and browser infos
  if (os) this.infos.os = os
  if (browser) this.infos.browser = browser
  if (_.isString(id)) this.id = id
  
  this._sockets = []
}

_.extend(WebSocketConnection.prototype, coreServer.Connection.prototype, {

  namespace: 'websockets',

  autoId: true,

  // Sends a message to the open sockets.
  // If there is an error, for example the socket is closed, it fails silently.
  send: function(address, args) {
    var buf = oscMin.toBuffer({ address: address, args: args || [] })
    this._sockets.forEach((socket) => socket.safeSend(buf))
  },

  // Add a new socket to the connection
  addSocket: function(socket) {
    this._sockets.push(socket)
    // Remove error listener that we initially added and proxy error to `WebSocketConnection`
    socket.removeAllListeners('error')
    socket.on('error', (err) => this.emit('error', new Error('ws error : ' + err.message)))
    socket.on('message', this._onMessage.bind(this))

    // Close the socket, cleans event handlers, etc ... 
    // Additionally, closes the connection if no sockets are left open.
    // NB: we don't need to remove the socket from `server.clients`, as `node-ws` is handling this.
    socket.once('close', () => {
      this.removeSocket(socket)
      if (this._sockets.length === 0) 
        this.close()
    })  
  },

  // Remove a socket from the connection
  removeSocket: function(socket) {
    var ind = this._sockets.indexOf(socket)
    if (ind !== -1) {
      this._sockets.splice(ind, 1)
      socket.removeAllListeners()
      socket.on('error', () => {})
      socket.close()
    }
  },

  // Immediately closes the connection, cleans event handlers, etc ...
  // NB: we don't need to remove the socket from `wsServer.clients`, as `node-ws` is handling this.
  close: function() {
    async.each(this._sockets.slice(0), (socket, next) => {
      this.removeSocket(socket)
      socket.once('close', () => next())
    }, (err) => {
      if (err) return this.emit('error', err)
      coreServer.Connection.prototype.close.apply(this)
    })
  },

  // Called when a message was received through one of the connection's websockets
  _onMessage: function(msg, flags) {
    if (_.isString(msg)) msg = new Buffer(msg, 'binary')
    
    try {
      msg = oscMin.fromBuffer(msg)
    } catch (err) {
      this.emit('error', new Error('invalid websocket message : ' + err.message))
      return
    }

    var address = msg.address, args = _.pluck(msg.args, 'value')
    if (coreMessages.sysAddressRe.exec(address)) this.onSysMessage(address, args)
    else {
      var err = connections.manager.send(address, args)
      if (err) this.send(coreMessages.errorAddress, err)
    }
  }

})


var WebSocketServer = module.exports = function(config) {
  coreServer.Server.call(this, config)
  this._wsServer = null
  this._config = config
}

_.extend(WebSocketServer.prototype, coreServer.Server.prototype, coreValidation.ValidateConfigMixin, {

  ConnectionClass: WebSocketConnection,

  // This method starts the websocket server, and calls `done(err)` when complete.
  start: function(done) {
    var serverOpts = { path: this._config.rootUrl }

    this.validateConfig((err) => {
      if (err) return done(err)
      coreServer.Server.prototype.start.apply(this)

      // Create the `node-ws` web socket server.
      if (this._config.serverInstance) serverOpts.server = this._config.serverInstance
      else serverOpts.port = this._config.port
      this._wsServer = new WebSocket.Server(serverOpts)
      this._wsServer.on('error', (err) => this.emit('error', new Error('ws server error : ' + err.message)))
      this._wsServer.on('connection', this._connectIfSpace.bind(this))
      // If websocket server bound to `serverInstance` and `serverInstance` is 
      // already listening, we're done ...
      if (this._config.serverInstance && this._config.serverInstance.address() !== null) done()
      else this._wsServer.on('listening', () => done())
    })
  },

  stop: function(done) {
    // `node-ws` has a bug when calling twice `.close()` on server.
    // So we need to remove all event handlers before, calling 'close' on the server
    // because this will trigger 'close' on each of the sockets.
    if (this._wsServer) {
      this._wsServer.clients.forEach((s) => s.removeAllListeners())
      this._wsServer.close((err) => {
        if (err) return done(err)
        this._wsServer.removeAllListeners()
        this._wsServer.on('error', () => {})
        this._wsServer = null
        coreServer.Server.prototype.stop.call(this, done)
      })
    } else done()
  },

  configValidator: new coreValidation.ChaiValidator({
    rootUrl: function(val) {
      expect(val).to.be.a('string')
    },
    port: function(val) {
      if (this.serverInstance) return
      expect(val).to.be.a('number')
      expect(val).to.be.within(0, 65535)
    },
    maxSockets: function(val) {
      expect(val).to.be.a('number')
    },
    serverInstance: function(val) {
      if (val)
        expect(val).to.be.an('object')
    }
  }),

  configDefaults: {
    maxSockets: 200,
    rootUrl: '/'
  },

  _connectIfSpace: function(socket) {

    // This safeSend function will allow to catch all send errors, including the synchronous ones.
    socket.safeSend = function(buf) {
      return this.send(buf, (err) => err && this.emit('error', err))
    }

    // First thing so we avoid crashes. We will later remove this handler
    // so that the connection object send the error instead
    socket.on('error', (err) => this.emit('error', new Error('ws error : ' + err.message)))

    // Parsing the config from the update request
    var socketConfig = parseUrl(socket.upgradeReq.url, true).query
      , id = socketConfig.id
      , connection = this._findConnection(id)

    // If there is space on the server, we keep that socket open, and either assign it
    // to an existing connection or open a new connection.
    if (this._getActiveSockets().length <= this._config.maxSockets) {
      
      var _onceConnectionOpen = function(connection) { 
        connection.addSocket(socket)
        // Send acknowledgement and connection id to the client
        var buf = oscMin.toBuffer({
          address: coreMessages.connectionStatusAddress,
          args: [ 0, connection.id ]
        })
        socket.safeSend(buf)
      }

      if (!connection) {
        this.openConnection([id, socketConfig.os, socketConfig.browser], (err, connection) => {
          if (err) return this.emit('error', err)
          _onceConnectionOpen(connection) 
        })
      } else _onceConnectionOpen(connection)

    // If the server is full, we send a message to the client signaling this.
    } else {
      var buf = oscMin.toBuffer({
        address: coreMessages.connectionStatusAddress,
        args: [ 1, 'the server is full' ]
      })
      socket.safeSend(buf)
      debug('server full - max of ' + this.connections.length + ' connections reached')
      socket.close()
    }
  },

  _findConnection: function(id) {
    return _.find(this.connections, (connection) => connection.id === id)
  },

  _getActiveSockets: function() {
    return this._wsServer.clients.filter((socket) => socket.readyState <= WebSocket.OPEN)
  },

  // Debug function for WebSocketServer
  debug: debug
})