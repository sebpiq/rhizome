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
  , shared = require('../shared')
  , sendJSON = shared.sendJSON
  , EventEmitter = require('events').EventEmitter
  , isBrowser = typeof window !== 'undefined'
_.extend(exports, new EventEmitter)

// Polyfills for testing-purpose only
var WebSocket = isBrowser ? window.WebSocket : require('ws')
  , Blob = isBrowser ? window.Blob : Buffer
  , wsUrl = isBrowser ? ('ws://' + window.location.hostname + ':' + window.location.port) : 'ws://localhost:8000'

// Context variables
var socket, socketEvents
  , nsTree, blobTransaction

// Maps socket state to client status
var wsStates = _.object([
  [WebSocket.CONNECTING, 'stopped'],
  [WebSocket.OPEN, 'started'],
  [WebSocket.CLOSING, 'stopped'],
  [WebSocket.CLOSED, 'stopped']
])

// ------------------------- Public API ------------------------- //

// Unique id of the client
exports.userId = null

// Configuration of the client
exports.config = {
  reconnect: 1000
}

// Starts the client, calling `done(err)` when the client is connected, or when it failed to open.
exports.start = function(done) {

  if (socket) {
    socket.close()
    forgetSocket()
  }

  nsTree = shared.createNsTree({
    createData: function(address) { return { handlers: [] } }
  })

  socketEvents = new EventEmitter

  createSocket(done)

  if (exports.config.reconnect) armReconnect()
}

// Stops the client, calling `done(err)` when the connection was closed successfully.
exports.stop = function(done) {
  if (socket && socket.readyState === socket.OPEN) {
    // If reconnection is armed, we need to cancel it immediately or it will be triggered
    // when the socket is done closing.
    disarmReconnect()
    socket.close()
    socketEvents.once('close', function() {
      forgetSocket()
      if (done) done(null)
    })
  } else if (done) done(null)
}

// Listens to the OSC messages sent at `address`.
// When a message arrives, the function `handler(address, args)` is called.
// `done(err)` is called once the client has started subscribing successfully.
exports.subscribe = function(address, handler, done) {
  _assertValidAddress(address)
  if (!socket) return _cbOrThrow(done, 'you must start the client before you can subscribe')

  // If the namespace doesn't exist yet, we need to create it first and then subscribe
  // to messages sent at this address by the server.
  if (!nsTree.has(address)) {
    doSubscribe(address, function(err) {
      nsTree.get(address).data.handlers.push(handler)
      if (done) done(err)
    })

  // Otherwise, if the client is already subscribing, we just need to add an extra handler
  } else {
    nsTree.get(address).data.handlers.push(handler)
    if (done) done(null)
  }
}

// Sends a message to OSC `address`, with arguments `args`, 
// or if `address` is a blob address, `args` is interpreted as a single blob. 
exports.send = function(address, args) {
  _assertValidAddress(address)
  if (_.some(args, function(arg) { return arg instanceof Blob })) {
    blobTransaction.send(address, args)
  } else sendJSON(socket, {command: 'message', address: address, args: args})
}

// Returns the current status of the client. Values can be `stopped` or `started`.
exports.status = function() {
  if (socket) return wsStates[socket.readyState]
  else return 'stopped'
}

// This function is used by the client to log events. By default it is a no-op.
exports.debug = function() {}

// ------------------------- Private API ------------------------- //
var doSubscribe = function(address, done) {
  sendJSON(socket, {command: 'subscribe', address: address})
  socketEvents.once('command:subscribe', function(msg) {
    if (msg.status === 0) {
      if (done) done(null)
    } else return _cbOrThrow(done, msg.error)
  })
}

var createSocket = function(done) {
  socket = new WebSocket(wsUrl)
  blobTransaction = new shared.BlobTransaction(socket, 'blobFromWeb', socketEvents)

  socket.addEventListener('open', _proxyOpen, false)
  socket.addEventListener('close', _proxyClose, false)
  socket.addEventListener('message', _proxyMessage, false)
  socket.addEventListener('error', _proxyError, false)

  socketEvents.once('open', onceConnectionOpen)
  socketEvents.once('error', onceConnectionError)
  socketEvents.once('connected', _.bind(_cbOrThrow, exports, done))
}

var forgetSocket = function() {
  exports.userId = null
  disarmReconnect()

  socket.removeEventListener('open', _proxyOpen, false)
  socket.removeEventListener('close', _proxyClose, false)
  socket.removeEventListener('message', _proxyMessage, false)
  socket.removeEventListener('error', _proxyError, false)

  socketEvents = null
  socket = null
  nsTree = null
}

var onceConnectionOpen = function(event) {
  socketEvents.removeListener('error', onceConnectionError)
  exports.debug('socket connected')

  socketEvents.once('command:connect', function(msg) {
    if (msg.status === 0) {
      socketEvents.on('command:message', onMessageCommand)
      socketEvents.on('error', onError)
      socketEvents.on('close', onClose)
      exports.userId = msg.userId
      socketEvents.emit('connected', null)
    } else if (msg.status === 1) {
      socket.close()
      forgetSocket()
      socketEvents.emit('connected', msg.error)
    }
  })

}

var onceConnectionError = function(event) {
  socketEvents.removeListener('open', onceConnectionOpen)
  socketEvents.emit('connected', event.toString())
}

var onMessageCommand = function(msg) {
  exports.debug('socket message received')
  nsTree.get(msg.address, function(ns) {
    _.forEach(ns.data.handlers, function(handler) {
      handler(msg.address, msg.args)
    })
  })
}

var onError = function(event) {
  exports.debug('socket error ' + event.toString())
}

var onClose = function(event) {
  exports.debug('socket closed')
}

var armReconnect = function() {
  socketEvents.once('close', reconnect)
}

var disarmReconnect = function() {
  socketEvents.removeListener('close', reconnect)
}

var reconnect = function() {
  setTimeout(function() {
    exports.debug('socket reconnecting')
    createSocket(function(err) {
      if (err) {
        exports.debug('socket failed reconnecting ' + err.toString())
        setTimeout(reconnect, exports.config.reconnect)
      } else {
        nsTree.get('/').forEach(function(ns) {
          doSubscribe(ns.address, function(err) {
            if (err) throw err // TODO : better err handling
          })
        })
        armReconnect()
      }
    })
  }, exports.config.reconnect)
}

var _proxyOpen = function(event) { socketEvents.emit('open', event) }
var _proxyClose = function(event) { socketEvents.emit('close', event) }
var _proxyMessage = function(event) {
  if (!(event.data instanceof Blob)) {
    var msg = JSON.parse(event.data)
    socketEvents.emit('command:' + msg.command, msg)
  }
}
var _proxyError = function(event) { socketEvents.emit('error', event) }

// ------------------------- Misc helpers ------------------------- //
var _cbOrThrow = function(done, err) {
  if ((!err) && done) done(null)
  else {
    err = (err instanceof Error) ? err : new Error(err)
    if (done) done(err)
    else throw err
  }
}

var _assertValidAddress = function(address) {
  var addressErr = shared.validateAddress(address)
  if (addressErr !== null) throw new Error(addressErr)
}
