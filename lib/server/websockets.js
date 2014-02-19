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
  , _ = require('underscore')
  , async = require('async')
  , debug = require('debug')('rhizome.websocket')
  , WebSocketServer = require('ws').Server
  , utils = require('./utils')
  , connections = require('./connections')
  , shared = require('../shared')
  , sendJSON = shared.sendJSON

var wsServer, idManager

// This method starts the websocket server, with the configuration `config`,
// and calling `done(err)` when complete.
exports.start = function(config, done) {
  var wsServerOpts = { path: config.server.rootUrl }
  if (config.server.instance) wsServerOpts.server = config.server.instance
  else wsServerOpts.port = config.server.webPort

  idManager = new utils.IdManager(config.server.usersLimit)

  wsServer = new WebSocketServer(wsServerOpts)

  wsServer.on('listening', function() {
    debug('ws server listening')
    done(null)
  })

  wsServer.on('connection', function(socket) {
    // We store the connection on the websocket instance itself.
    var connection = socket.rhizome = new WebSocketConnection(socket)

    // If the server is full, `idManager` returns `null`.
    if (connection.userId !== null) {
      debug('connected - now ' + wsServer.clients.length + ' sockets')

      socket.on('message', connection.receive.bind(connection))

      socket.on('close', function() {
        socket.rhizome.close()
        debug('closed - now ' + wsServer.clients.length + ' sockets')
      })

      // We send a message to signal connection success and transmit the userId
      sendJSON(socket, {command: 'connect', status: 0, userId: connection.userId})

    // If the server is full, we simply close the socket and send a message 
    // that connection failed.
    } else {
      debug('FULL : ' + wsServer.clients.length + ' connected')
      sendJSON(socket, {command: 'connect', status: 1, error: 'the server is full'})
      socket.rhizome.close()
    }

  })

}

// This method closes the server, and calls `done(err)` when complete.
exports.stop = function(done) {
  // `node-ws` has a bug when calling twice `.close()` on server.
  // So we need to make sure this doesn't happen.
  if (wsServer) {
    // We remove event handlers, cause 'close' will be triggered by the server
    wsServer.clients.forEach(function(socket) { socket.removeAllListeners() })
    wsServer.close()
    wsServer = null
    idManager = null
    connections.removeAll()
  }
  if (done) done()
}

// Accessor for the current list of sockets of the server 
exports.sockets = function() { return wsServer ? wsServer.clients : [] }


/* -------------------- WebSocket Connections -------------------- */
// Class to handle connections from websocket clients.
var WebSocketConnection = function(socket) {
  this.blobTransaction = null
  this.userId = idManager.get()
  this.socket = socket
}

_.extend(WebSocketConnection.prototype, {

  // Sends a message to the web page
  send: function(address, args) {
        // TODO: Blobs
    if (Buffer.isBuffer(args)) this.sendJSON({ command: 'blob', address: address, blob: args })
    this.sendJSON({ command: 'message', address: address, args: args })
  },

  // receives a message from the web page
  receive: function(msg, flags) {
    if (!flags.binary) {
      msg = JSON.parse(msg)

      if (msg.command === 'message') {
        connections.send(msg.address, msg.args)
        debug('received message for address ' + msg.address + ' with args ' + msg.args)

      } else if (msg.command === 'subscribe') {
        connections.subscribe(msg.address, this)
        this.sendJSON({command: 'subscribe', status: 0, address: msg.address})

      } else if (msg.command === 'blob') {
        this.blobTransaction = msg
        this.sendJSON({command: 'blob', status: 0})

      } else throw new Error('unknown command ' + msg.command)

    // When sending blobs, we need to decompose the message into several messages.
    // First, a message containing meta-data : address, original args,
    // original position of the blobs in the args. Here, we recompose this message
    // into one.
    } else if (this.blobTransaction) {
      this.blobTransaction.args[this.blobTransaction.blobArgIndices.shift()] = msg
      this.sendJSON({command: 'blob', status: 0})
      if (this.blobTransaction.blobArgIndices.length === 0) {
        connections.send(this.blobTransaction.address, this.blobTransaction.args)
        this.blobTransaction = null
      }
      
    } else throw new Error('unexpected blob received')
  },

  // This forgets the socket and closes the connection
  close: function() {
    // Free the `userId` for another connection
    idManager.free(this.userId)

    // Immediately closes the connection, cleans event handlers, etc ...
    // NB: we don't need to remove the socket from `wsServer.clients`, as `node-ws` is handling this.
    this.socket.close()
    connections.remove(this)
  },

  sendJSON: function(obj) { sendJSON(this.socket, obj) }

})
