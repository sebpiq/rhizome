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
  , parseUrl = require('url').parse
  , _ = require('underscore')
  , async = require('async')
  , debug = require('debug')('rhizome.server.websocket')
  , WebSocketServer = require('ws').Server
  , browserify = require('browserify')
  , gulp = require('gulp')
  , uglify = require('gulp-uglify')
  , gutil = require('gulp-util')
  , source = require('vinyl-source-stream')
  , buffer = require('vinyl-buffer')
  
  , utils = require('./core/utils')
  , Connection = require('./core/Connection')
  , connections = require('./connections')
  , shared = require('../shared')
  , sendJSON = shared.sendJSON

var wsServer, idManager, queuedConnections

// This method starts the websocket server, with the configuration `config`,
// and calling `done(err)` when complete.
exports.start = function(config, done) {
  debug('starting')

  var wsServerOpts = { path: config.rootUrl }
  if (config.serverInstance) wsServerOpts.server = config.serverInstance
  else wsServerOpts.port = config.webPort

  idManager = new utils.IdManager(config.usersLimit)
  wsServer = new WebSocketServer(wsServerOpts)
  queuedConnections = new utils.Queue()

  wsServer.on('listening', function() {
    done(null)
  })

  wsServer.on('connection', function(socket) {
    // We store the connection on the websocket instance itself.
    var connection = socket.rhizome = new WebSocketConnection(socket)
  })

}

// This method closes the server, and calls `done(err)` when complete.
exports.stop = function(done) {
  debug('stopping')
  
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

// Renders the web client to `destinationDir`, as a single JavaScript file called `rhizome.js`.
exports.renderClient = function(destinationDir, done) {
  browserify({ entries: path.resolve(__dirname, '../web-client/index.js') })
    .bundle()
    .pipe(source('rhizome.js'))
    .pipe(buffer())
    .pipe(uglify())
    .on('error', done)
    // No need to create folder as gulp.dest takes care of it
    .pipe(gulp.dest(destinationDir))
    .on('error', done)
    .on('finish', done)
}


/* ========================= WebSocket Connections ========================= */
// Class to handle connections from websocket clients.
var WebSocketConnection = function(socket) {
  Connection.apply(this)
  this.blobTransaction = new shared.BlobTransaction(socket, 'blobFromServer', 'blobFromWeb', this)
  this.socket = socket
  this._queueIfFull = false

  // Binding events
  socket.on('message', this.onMessage.bind(this))
  socket.once('close', this.close.bind(this))
  this.on('command:message', this.onMessageCommand.bind(this))
  this.on('command:blobFromWeb', this.onBlobFromWebCommand.bind(this))

  // Parsing the config from the update request
  var config = parseUrl(socket.upgradeReq.url, true).query
  this._queueIfFull = config.hasOwnProperty('queueIfFull') ? JSON.parse(config.queueIfFull) : false

  // Finally, send the connect status to the client
  this.sendConnectStatus()
}

_.extend(WebSocketConnection.prototype, Connection.prototype, {

  sendConnectStatus: function() {
    this.userId = idManager.get()

    // If there is space on the server, we send acknowledgement and broadcast
    // a message announcing new connection.
    if (this.userId !== null) {
      debug('connected - now ' + wsServer.clients.length + ' sockets')
      this.sendJSON({ command: 'connect', status: 0, userId: this.userId })
      connections.send(shared.connectionOpenAddress, [ this.userId ])

    // If the server is full, we send a message to the client signaling this,
    // and wait for an answer telling whether the client wants to queue for a space or not
    } else {
      this.sendJSON({ command: 'connect', status: 1, error: 'the server is full' })
      if (this._queueIfFull) {
        debug('queueing - max of ' + wsServer.clients.length + ' sockets reached')
        queuedConnections.add(this)
      } else {
        debug('server full - max of ' + wsServer.clients.length + ' sockets reached')
        this.close()
      }
    }
  },

  // Sends a message to the web page.
  // If there is an error, for example the socket is closed, it fails silently.
  send: function(address, args) {
    try {
      if (args.some(function(arg) { return arg instanceof Buffer })) {
        this.blobTransaction.send(address, args)
      } else this.sendJSON({ command: 'message', address: address, args: args })
    } catch (err) {
      if (this.socket.readyState !== 'OPEN')
        console.error('web socket send failed : ' + err)
      else throw err
    }
  },

  // This forgets the socket and closes the connection
  close: function() {
    idManager.free(this.userId)
    queuedConnections.remove(this)

    // If there is some clients waiting for a free space, connect them
    var queuedConnection = queuedConnections.pop()
    if (queuedConnection) queuedConnection.sendConnectStatus()

    // Immediately closes the connection, cleans event handlers, etc ...
    // NB: we don't need to remove the socket from `wsServer.clients`, as `node-ws` is handling this.
    this.socket.close()
    connections.remove(this)

    // Send a close message with userId to all connections
    if (_.isNumber(this.userId))
      connections.send(shared.connectionCloseAddress, [this.userId])
    debug('closed - now ' + wsServer.clients.length + ' sockets')
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
    if (shared.sysAddressRe.exec(address)) this.onSysMessage(address, args)
    else {
      var err = connections.send(msg.address, msg.args)
      if (err) this.send(shared.errorAddress, err)
    }
  },

  // Receiving a blob send by the client a blob transaction
  onBlobFromWebCommand: function(msg) {
    this.blobTransaction.receive(msg)
  },

  sendJSON: function(obj) { sendJSON(this.socket, obj) },

  toString: function() { return 'WSConnection(' + this.userId + ')' }
})
