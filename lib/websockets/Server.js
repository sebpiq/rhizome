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

var parseUrl = require('url').parse
  , _ = require('underscore')
  , debug = require('debug')('rhizome.server.websocket')
  , WSServer = require('ws').Server
  , coreServer = require('../core/server')
  , connections = require('../connections')
  , coreUtils = require('../core/utils')
  , coreMessages = require('../core/messages')
  , BlobTransaction = require('./utils').BlobTransaction
  , sendJSON = require('./utils').sendJSON


var WebSocketServer = module.exports = function(config) {
  coreServer.Server.apply(this)
  this.wsServer = null
  this.idManager = null
  this._config = config
}

_.extend(WebSocketServer.prototype, coreServer.Server.prototype, {

  // This method starts the websocket server, and calls `done(err)` when complete.
  start: function(done) {
    var serverOpts = { path: this._config.rootUrl }
      , self = this
    coreServer.Server.prototype.start.apply(this)
    this.idManager = new coreUtils.IdManager(this._config.usersLimit)
    this.queuedSockets = new coreUtils.Queue()

    // Create the `node-ws` web socket server.
    if (this._config.serverInstance) serverOpts.server = this._config.serverInstance
    else serverOpts.port = this._config.webPort
    this.wsServer = new WSServer(serverOpts)
    this.wsServer.on('listening', function() { done(null) })
    this.wsServer.on('connection', this._connectIfSpace.bind(this))

    // When a connection got closed, we check if there is 
    // other connections waiting in the queue.
    this.on('connection', function(connection) {
      connection.on('close', function() {
        self.idManager.free(connection.userId)
        self.queuedSockets.remove(connection.socket)
        var socket = self.queuedSockets.pop()
        if (socket) self._connectIfSpace(socket)
      })
    })
  },

  stop: function(done) {
    coreServer.Server.prototype.stop.apply(this)
    // `node-ws` has a bug when calling twice `.close()` on server.
    // So we need to remove all event handlers before, calling 'close' on the server
    // because this will trigger 'close' on each of the sockets.
    if (this.wsServer) {
      this.wsServer.clients.forEach(function(s) { s.removeAllListeners() })
      this.wsServer.close()
      this.wsServer = null
      this.idManager = null
    }
    if (done) done()
  },

  // Accessor for the current list of sockets of the server 
  sockets: function() { return this.wsServer ? this.wsServer.clients : [] },

  _connectIfSpace: function(socket) {
    var userId = this.idManager.get()

    // Parsing the config from the update request
    var config = parseUrl(socket.upgradeReq.url, true).query
      , queueIfFull = config.hasOwnProperty('queueIfFull') ? JSON.parse(config.queueIfFull) : false

    // If there is space on the server, we send acknowledgement.
    if (userId !== null) {
      var newConnection = new WebSocketConnection(socket)
      newConnection.userId = userId
      sendJSON(socket, { command: 'connect', status: 0, userId: userId })
      this.open(newConnection)

    // If the server is full, we send a message to the client signaling this.
    } else {
      sendJSON(socket, { command: 'connect', status: 1, error: 'the server is full' })
      if (queueIfFull) {
        debug('queueing - max of ' + this.connections.length + ' connections reached')
        this.queuedSockets.add(socket)
      } else {
        debug('server full - max of ' + this.connections.length + ' connections reached')
        socket.close()
      }
    }
  },

  // Debug function for WebSocketServer
  debug: debug
})



// Class to handle connections from websocket clients.
var WebSocketConnection = function(socket) {
  coreServer.Connection.apply(this)
  this.blobTransaction = new BlobTransaction(socket, 'blobFromServer', 'blobFromWeb', this)
  this.socket = socket
  this.socket.on('message', this.onMessage.bind(this))
  this.socket.once('close', this.close.bind(this))
  this.on('command:message', this.onMessageCommand.bind(this))
  this.on('command:blobFromWeb', this.onBlobFromWebCommand.bind(this))
}

_.extend(WebSocketConnection.prototype, coreServer.Connection.prototype, {

  // Sends a message to the web page.
  // If there is an error, for example the socket is closed, it fails silently.
  send: function(address, args) {
    try {
      if (args.some(function(arg) { return arg instanceof Buffer })) {
        this.blobTransaction.send(address, args)
      } else sendJSON(this.socket, { command: 'message', address: address, args: args })
    } catch (err) {
      if (this.socket.readyState !== 'OPEN')
        console.error('web socket send failed : ' + err)
      else throw err
    }
  },

  // Immediately closes the connection, cleans event handlers, etc ...
  // NB: we don't need to remove the socket from `this.server.clients`, as `node-ws` is handling this.
  close: function() {
    this.socket.removeAllListeners()
    this.socket.close()
    coreServer.Connection.prototype.close.apply(this)
  },

  onMessage: function(msg, flags) {
    if (!flags.binary) {
      var msg = JSON.parse(msg)
      this.emit('command:' + msg.command, msg)
    } else this.emit('blob', msg)
  },

  // Simple message `/some/address arg1 arg2 arg3 ...`
  onMessageCommand: function(msg) {
    var address = msg.address, args = msg.args
    if (coreMessages.sysAddressRe.exec(address)) this.onSysMessage(address, args)
    else {
      var err = connections.send(msg.address, msg.args)
      if (err) this.send(coreMessages.errorAddress, err)
    }
  },

  // Receiving a blob send by the client a blob transaction
  onBlobFromWebCommand: function(msg) {
    this.blobTransaction.receive(msg)
  },

  toString: function() { return 'WSConnection(' + this.userId + ')' }
})
