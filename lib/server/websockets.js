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

var _ = require('underscore')
  , osc = require('node-osc')
  , debug = require('debug')('rhizome.websocket')
  , WebSocketServer = require('ws').Server
  , utils = require('./utils')
  , shared = require('../shared')
  , sendJSON = shared.sendJSON

var wsServer
  , idManager, nsTree
  , oscServer, oscClients

exports.start = function(config, done) {
  var wsServerOpts = { path: config.server.rootUrl }
  if (config.server.instance) wsServerOpts.server = config.server.instance
  else wsServerOpts.port = config.server.port

  idManager = new utils.IdManager(config.server.usersLimit)

  oscClients = config.osc.clients.map(function(client) {
    return new osc.Client(client.ip, client.port)
  })

  nsTree = exports.nsTree = shared.createNsTree({
    createData: function() { return { sockets: [] } }
  })

  wsServer = new WebSocketServer(wsServerOpts)

  wsServer.on('listening', function() {
    debug('ws server listening')
    done(null)
  })

  wsServer.on('connection', function(socket) {
    var userId = idManager.get()

    if (userId !== null) {
      socket.userId = userId
      debug('connected - now ' + wsServer.clients.length + ' sockets')

      socket.on('message', function(msg, flags) {
        if (!flags.binary) {
          msg = JSON.parse(msg)

          if (msg.command === 'message') {
            debug('received message for address ' + msg.address + ' with args ' + msg.args)
            oscClients.forEach(function(client) {
              client.send.apply(client, [msg.address].concat(msg.args))
            })

          } else if (msg.command === 'listen') {
            var addrSockets = nsTree.get(msg.address).data.sockets
            if (addrSockets.indexOf(socket) === -1) addrSockets.push(socket)
            sendJSON(socket, _.extend(msg, {status: 0}))

          } else throw new Error('unknown command ' + msg.command)
        } else {
          // message is a blob
        }
      })

      socket.on('close', function() {
        forget(socket)
        debug('closed - now ' + wsServer.clients.length + ' sockets')
      })

      sendJSON(socket, {command: 'connect', status: 0, userId: userId})

    } else {
      debug('FULL : ' + wsServer.clients.length + ' connected')
      sendJSON(socket, {command: 'connect', status: 1, error: 'the server is full'})
      forget(socket)
    }

  })

}

exports.stop = function(done) {
  wsServer.close()
  if (done) done()
}

var forget = exports.forget = function(socket) {
  var sInd

  // Free the `userId` for another connection
  idManager.free(socket.userId)

  // Immediately closes the connection, cleans event handlers, etc ...
  socket.close()
  nsTree.get('/').forEach(function(ns) {
    ns.data.sockets = _.without(ns.data.sockets, socket)
  })

  // TODO: not sure about that :
  //if ((sInd = wsServer.clients.indexOf(socket)) !== -1) wsServer.clients.splice(sInd, 1)
}

exports.sockets = function() { return wsServer ? wsServer.clients : [] }
