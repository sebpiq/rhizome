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
  var wsServerOpts = { path: config.rootUrl }
  if (config.serverInstance) wsServerOpts.server = config.serverInstance
  else wsServerOpts.port = config.webPort

  idManager = new utils.IdManager(config.usersLimit)

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

      // Binding event handlers
      socket.on('message', connection.onMessage.bind(connection))
      socket.on('command:message', connection.onMessageCommand.bind(connection))
      socket.on('command:subscribe', connection.onSubscribeCommand.bind(connection))
      socket.on('command:blobFromWeb', connection.onBlobFromWebCommand.bind(connection))
      socket.once('close', connection.close.bind(connection))
      socket.once('close', function() { debug('closed - now ' + wsServer.clients.length + ' sockets') })

      // We send a message to signal connection success and transmit the userId
      connection.sendJSON({command: 'connect', status: 0, userId: connection.userId})

    // If the server is full, we simply close the socket and send a message 
    // that connection failed.
    } else {
      debug('FULL : ' + wsServer.clients.length + ' connected')
      connection.sendJSON({command: 'connect', status: 1, error: 'the server is full'})
      connection.close()
    }

  })

}

// This method closes the server, and calls `done(err)` when complete.
exports.stop = function(done) {
  // `node-ws` has a bug when calling twice `.close()` on server.
  // So we need to make sure this doesn't happen.
  if (wsServer) {
    // We remove event handlers, cause 'close' will be triggered by the server
    wsServer.clients.forEach(function(socket) {
      connections.remove(socket.rhizome)
      socket.removeAllListeners()
    })
    wsServer.close()
    wsServer = null
    idManager = null
  }
  if (done) done()
}

// Accessor for the current list of sockets of the server 
exports.sockets = function() { return wsServer ? wsServer.clients : [] }


/* -------------------- WebSocket Connections -------------------- */
// Class to handle connections from websocket clients.
var WebSocketConnection = function(socket) {
  this.blobTransaction = new shared.BlobTransaction(socket, 'blobFromServer', 'blobFromWeb', socket)
  this.userId = idManager.get()
  this.socket = socket
}

_.extend(WebSocketConnection.prototype, {

  // Sends a message to the web page
  send: function(address, args) {
    if (args.some(function(arg) { return arg instanceof Buffer })) {
      this.blobTransaction.send(address, args)
    } else this.sendJSON({ command: 'message', address: address, args: args })
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

  sendJSON: function(obj) { sendJSON(this.socket, obj) },

  onMessage: function(msg, flags) {
    if (!flags.binary) {
      var msg = JSON.parse(msg)
      this.socket.emit('command:' + msg.command, msg)
    } else this.socket.emit('blob', msg)
  },

  onMessageCommand: function(msg) {
    connections.send(msg.address, msg.args)
    debug('received message for address ' + msg.address + ' with args ' + msg.args)
  },

  onSubscribeCommand: function(msg) {
    connections.subscribe(msg.address, this)
    this.sendJSON({command: 'subscribe', status: 0, address: msg.address})
  },

  onBlobFromWebCommand: function(msg) {
    this.blobTransaction.receive(msg)
  }

})
