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
  
  , utils = require('../core/utils')
  , Server = require('../core/Server')
  , shared = require('../../shared')
  , sendJSON = shared.sendJSON
  , WebSocketConnection = require('./WebSocketConnection')


var WebSocketServer = module.exports = function() {
  Server.apply(this)
  this.wsServer = null
  this.idManager = null
}

_.extend(WebSocketServer.prototype, Server.prototype, {

  // This method starts the websocket server, with the configuration `config`,
  // and calling `done(err)` when complete.
  start: function(config, done) {
    Server.prototype.start.apply(this)

    var serverOpts = { path: config.rootUrl }
    if (config.serverInstance) serverOpts.server = config.serverInstance
    else serverOpts.port = config.webPort

    this.idManager = new utils.IdManager(config.usersLimit)
    this.wsServer = new WSServer(serverOpts)
    this.queuedSockets = new utils.Queue()

    this.wsServer.on('listening', function() { done(null) })
    this.wsServer.on('connection', this._connectIfSpace.bind(this))
  },

  // This method closes the server, and calls `done(err)` when complete.
  stop: function(done) {
    Server.prototype.stop.apply(this)
    // `node-ws` has a bug when calling twice `.close()` on server.
    // So we need to make sure this doesn't happen.
    if (this.wsServer) {
      // We need to remove all event handlers before, calling 'close'
      this.wsServer.clients.forEach(function(s) { s.removeAllListeners() })
      this.wsServer.close()
      this.wsServer = null
      this.idManager = null
    }
    if (done) done()
  },

  onConnectionClosed: function(connection) {
    Server.prototype.onConnectionClosed.apply(this, [connection])
    this.idManager.free(connection.userId)
    this.queuedSockets.remove(connection.socket)

    // If there is some clients waiting for a free space, connect them
    var socket = this.queuedSockets.pop()
    if (socket) this._connectIfSpace(socket)
  },

  // Accessor for the current list of sockets of the server 
  sockets: function() { return this.wsServer ? this.wsServer.clients : [] },

  _connectIfSpace: function(socket) {
    var userId = this.idManager.get()

    // Parsing the config from the update request
    var config = parseUrl(socket.upgradeReq.url, true).query
      , queueIfFull = config.hasOwnProperty('queueIfFull') ? JSON.parse(config.queueIfFull) : false

    // If there is space on the server, we send acknowledgement and broadcast
    // a message announcing new connection.
    if (userId !== null) {
      var newConnection = new WebSocketConnection(socket, this)
      newConnection.userId = userId
      sendJSON(socket, { command: 'connect', status: 0, userId: userId })
      this.addConnection(newConnection)

    // If the server is full, we send a message to the client signaling this,
    // and wait for an answer telling whether the client wants to queue for a space or not
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