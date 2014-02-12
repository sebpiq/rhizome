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
  , osc = require('node-osc')
  , debug = require('debug')('rhizome.websocket')
  , WebSocketServer = require('ws').Server
  , utils = require('./utils')
  , shared = require('../shared')
  , sendJSON = shared.sendJSON

var wsServer
  , idManager, nsTree
  , oscServer, oscClients

// This method starts the websocket server, with the configuration `config`,
// and calling `done(err)` when complete.
exports.start = function(config, done) {
  var wsServerOpts = { path: config.server.rootUrl }
  if (config.server.instance) wsServerOpts.server = config.server.instance
  else wsServerOpts.port = config.server.port

  idManager = new utils.IdManager(config.server.usersLimit)

  oscClients = config.osc.clients.map(function(client) {
    return new osc.Client(client.ip, client.port)
  })

  // Helper to send a message to all OSC clients
  oscClients.send = function(address, args) {            
    this.forEach(function(client) {
      client.send.apply(client, [address].concat(args))
    })
  }

  nsTree = exports.nsTree = shared.createNsTree({
    createData: function() { return { sockets: [] } }
  })

  wsServer = new WebSocketServer(wsServerOpts)

  wsServer.on('listening', function() {
    debug('ws server listening')
    done(null)
  })

  wsServer.on('connection', function(socket) {
    // We put all data we need in an object on the socket to avoid pollution.
    socket.rhizome = {waitingBlob: false, userId: idManager.get()}

    // If the server is full, `idManager` returns `null`.
    if (socket.rhizome.userId !== null) {
      debug('connected - now ' + wsServer.clients.length + ' sockets')

      socket.on('message', function(msg, flags) {
        if (!flags.binary) {
          msg = JSON.parse(msg)

          if (msg.command === 'message') {
            oscClients.send(msg.address, msg.args)
            debug('received message for address ' + msg.address + ' with args ' + msg.args)

          } else if (msg.command === 'listen') {
            var addrSockets = nsTree.get(msg.address).data.sockets
            if (addrSockets.indexOf(socket) === -1) addrSockets.push(socket)
            sendJSON(socket, _.extend(msg, {status: 0}))

          } else if (msg.command === 'blob') {
            socket.rhizome.waitingBlob = msg.address

          } else throw new Error('unknown command ' + msg.command)

        } else if (socket.rhizome.waitingBlob) {
          // Pick a random file name in `config.server.blobsDirName`, and save the blob there.
          // Once done, notifies everybody.
          async.waterfall([
            function(next) { utils.getFreeFilePath(config.server.blobsDirName, next) },
            function(filePath, next) { fs.writeFile(filePath, msg, function(err) { next(err, filePath) }) }
          ], function(err, filePath) {
            if (err) throw new Error(err)
            var address = socket.rhizome.waitingBlob
            socket.rhizome.waitingBlob = false
            sendJSON(socket, {command: 'blob', status: 0})
            oscClients.send(address, [socket.rhizome.userId, filePath])
          })
          
        } else throw new Error('unexpected blob received')
      })

      socket.on('close', function() {
        forget(socket)
        debug('closed - now ' + wsServer.clients.length + ' sockets')
      })

      // We send a message to signal connection success and transmit the userId
      sendJSON(socket, {command: 'connect', status: 0, userId: socket.rhizome.userId})

    // If the server is full, we simply close the socket and send a message 
    // that connection failed.
    } else {
      debug('FULL : ' + wsServer.clients.length + ' connected')
      sendJSON(socket, {command: 'connect', status: 1, error: 'the server is full'})
      forget(socket)
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
    nsTree = null
    idManager = null
  }
  if (done) done()
}

// This forgets the socket and closes the connection
var forget = exports.forget = function(socket) {
  var sInd

  // Free the `userId` for another connection
  idManager.free(socket.rhizome.userId)

  // Immediately closes the connection, cleans event handlers, etc ...
  // NB: we don't need to remove the socket from `wsServer.clients`, as `node-ws` is handling this.
  socket.close()
  nsTree.get('/').forEach(function(ns) {
    ns.data.sockets = _.without(ns.data.sockets, socket)
  })
}

// Accessor for the current list of sockets of the server 
exports.sockets = function() { return wsServer ? wsServer.clients : [] }
