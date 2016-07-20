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

var parseUrl = require('url').parse
  , _ = require('underscore')
  , debug = require('debug')('rhizome.server.websocket')
  , WebSocket = require('ws')
  , expect = require('chai').expect
  , oscMin = require('osc-min')
  , coreServer = require('../core/server')
  , connections = require('../connections')
  , coreUtils = require('../core/utils')
  , coreValidation = require('../core/validation')
  , coreMessages = require('../core/messages')


var WebSocketServer = module.exports = function(config) {
  coreServer.Server.call(this, config)
  this._wsServer = null
  this._config = config
}


_.extend(WebSocketServer.prototype, coreServer.Server.prototype, coreValidation.ValidateConfigMixin, {

  // This method starts the websocket server, and calls `done(err)` when complete.
  start: function(done) {
    var serverOpts = { path: this._config.rootUrl }
      , self = this

    this.validateConfig(function(err) {
      if (err) return done(err)
      coreServer.Server.prototype.start.apply(self)

      // Create the `node-ws` web socket server.
      if (self._config.serverInstance) serverOpts.server = self._config.serverInstance
      else serverOpts.port = self._config.port
      self._wsServer = new WebSocket.Server(serverOpts)
      self._wsServer.on('error', function(err) { console.error('ws server error : ' + err) })
      self._wsServer.on('connection', self._connectIfSpace.bind(self))
      // If websocket server bound to `serverInstance` and `serverInstance` is 
      // already listening, we're done ...
      if (self._config.serverInstance && self._config.serverInstance.address() !== null) done()
      else self._wsServer.on('listening', function() { done() })
    })
  },

  stop: function(done) {
    coreServer.Server.prototype.stop.apply(this)
    // `node-ws` has a bug when calling twice `.close()` on server.
    // So we need to remove all event handlers before, calling 'close' on the server
    // because this will trigger 'close' on each of the sockets.
    if (this._wsServer) {
      this._wsServer.clients.forEach(function(s) { s.removeAllListeners() })
      this._wsServer.close()
      this._wsServer.removeAllListeners()
      this._wsServer = null
    }
    if (done) done()
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
      var self = this
      return this.send(buf, function(err) { 
        if (err) self.emit('error', err) 
      })
    }

    // First thing so we avoid crashes
    socket.on('error', function(err) { console.error('ws error : ' + err) })

    // Parsing the config from the update request
    var socketConfig = parseUrl(socket.upgradeReq.url, true).query
      , id = socketConfig.id
      , connection = this._findConnection(id)
      , self = this

    // If there is space on the server, we keep that socket open, and either assign it
    // to an existing connection or open a new connection.
    if (this._getActiveSockets().length <= this._config.maxSockets) {
      
      var _onceConnectionOpen = function() {     
        connection.addSocket(socket)
        // Send acknowledgement and connection id to the client
        var buf = oscMin.toBuffer({
          address: coreMessages.connectionStatusAddress,
          args: [ 0, connection.id ]
        })
        socket.safeSend(buf)
      }

      if (!connection) {
        connection = new WebSocketServer.Connection(socket)
        // Save os and browser infos
        if (socketConfig.os) {
          connection.infos.os = socketConfig.os
          connection.infos.browser = socketConfig.browser
        }
        if (_.isString(id))
          connection.id = id
        connection.once('open', _onceConnectionOpen)
        this.open(connection)
      } else _onceConnectionOpen()

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
    return _.find(this.connections, function(connection) {
      return connection.id === id
    })
  },

  _getActiveSockets: function() {
    return this._wsServer.clients.filter(function(socket) { 
      return socket.readyState <= WebSocket.OPEN
    })
  },

  // Debug function for WebSocketServer
  debug: debug
})



// Class to handle connections from websocket clients.
var WebSocketConnection = function(socket) {
  coreServer.Connection.apply(this)
  this._sockets = []
}
WebSocketServer.Connection = WebSocketConnection

_.extend(WebSocketConnection.prototype, coreServer.Connection.prototype, {

  namespace: 'websockets',

  autoId: true,

  // Sends a message to the open sockets.
  // If there is an error, for example the socket is closed, it fails silently.
  send: function(address, args) {
    var buf = oscMin.toBuffer({ address: address, args: args || [] })
    this._sockets.forEach(function(socket) {
      socket.safeSend(buf)
    })
  },

  // Add a new socket to the connection
  addSocket: function(socket) {
    this._sockets.push(socket)
    socket.on('message', this._onMessage.bind(this))
    socket.once('close', this._onSocketClosed.bind(this, socket))
  },

  // Immediately closes the connection, cleans event handlers, etc ...
  // NB: we don't need to remove the socket from `this.server.clients`, as `node-ws` is handling this.
  close: function() {
    coreServer.Connection.prototype.close.apply(this)
    this._sockets.forEach(function(socket) {
      socket.removeAllListeners()
      socket.close()
    })
  },

  // Close the socket, cleans event handlers, etc ... 
  // Additionally, closes the connection if no sockets are left open.
  // NB: we don't need to remove the socket from `server.clients`, as `node-ws` is handling this.
  _onSocketClosed: function(socket) {
    // Closing the socket and removing it from the list
    var ind = this._sockets.indexOf(socket)
    if (ind !== -1) {
      this._sockets.splice(ind, 1)
      socket.removeAllListeners()
      socket.close()
    }

    // If that was the last socket, close the connection
    if (this._sockets.length === 0)
      coreServer.Connection.prototype.close.apply(this)
  },

  // Called when a message was received through one of the connection's websockets
  _onMessage: function(msg, flags) {
    if (_.isString(msg)) msg = new Buffer(msg, 'binary')
    
    try {
      msg = oscMin.fromBuffer(msg)
    } catch (err) {
      console.log('invalid websocket message : ' + err)
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