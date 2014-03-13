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
  , WebSocket = require('ws') // polyfilling not required -> https://github.com/einaros/ws/blob/master/lib/browser.js
  , isBrowser = typeof window !== 'undefined'
_.extend(exports, new EventEmitter)

// Polyfills for testing-purpose only
var Blob = isBrowser ? window.Blob : Buffer
  , wsUrl = isBrowser ? ('ws://' + window.location.hostname + ':' + window.location.port) : 'ws://localhost:8000'

// Context variables
var socket, socketEvents, blobTransaction

// Maps socket state to client status
var wsStates = _.object([
  [WebSocket.CONNECTING, 'stopped'],
  [WebSocket.OPEN, 'started'],
  [WebSocket.CLOSING, 'stopped'],
  [WebSocket.CLOSED, 'stopped']
])


// ========================= PUBLIC API ========================= //
// Unique id of the client
exports.userId = null

// Configuration of the client
exports.config = {
  reconnect: 1000
}

// Starts the client, calling `done(err)` when the client is connected, or when it failed to open.
exports.start = function(done) {
  if (!exports.isSupported())
    return done(new Error('the current browser is not supported'))
  if (socket) {
    socket.close()
    forgetSocket()
  }
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
    socketEvents.removeListener('close', onConnectionLost)
    socket.close()
    socketEvents.once('close', function() {
      forgetSocket()
      if (done) done(null)
    })
  } else if (done) done(null)
}

// Sends a message to OSC `address`, with arguments `args`, 
// or if `address` is a blob address, `args` is interpreted as a single blob. 
exports.send = function(address, args) {
  args = args || []
  _assertValid(shared.validateAddressForSend, address)
  _assertValid(shared.validateArgs, args)
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
exports.log = function() {}

// This function returns `true` if the web client is supported by the current browser, `false` otherwise.
exports.isSupported = function() { return (!_.isUndefined(WebSocket)) && WebSocket.prototype.CLOSING === 2 }


// ========================= PRIVATE API ========================= //
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
  blobTransaction = new shared.BlobTransaction(socket, 'blobFromWeb', 'blobFromServer', socketEvents)

  socket.addEventListener('open', _proxyOpen, false)
  socket.addEventListener('close', _proxyClose, false)
  socket.addEventListener('message', onMessage, false)
  socket.addEventListener('error', _proxyError, false)

  socketEvents.once('open', onceConnectionOpen)
  socketEvents.once('error', onceConnectionError)
  socketEvents.once('connection:success', function() {
    socketEvents.removeAllListeners('connection:failure')
    if (done) done()
  })
  socketEvents.once('connection:failure', function(err) {
    _cbOrThrow(done, err)
    socketEvents.removeAllListeners('connection:success')
  })
}

var forgetSocket = function() {
  exports.userId = null
  disarmReconnect()

  socket.removeEventListener('open', _proxyOpen, false)
  socket.removeEventListener('close', _proxyClose, false)
  socket.removeEventListener('message', onMessage, false)
  socket.removeEventListener('error', _proxyError, false)

  socketEvents = null
  socket = null
}

var armReconnect = function() {
  socketEvents.once('close', reconnect)
}

var disarmReconnect = function() {
  socketEvents.removeListener('close', reconnect)
}

var reconnect = function() {
  setTimeout(function() {
    exports.log('socket reconnecting')
    createSocket(function(err) {
      if (err) {
        exports.log('socket failed reconnecting ' + err.toString())
        setTimeout(reconnect, exports.config.reconnect)
      } else {
        armReconnect()
        onReconnected()
      }
    })
  }, exports.config.reconnect)
}


// --------------- LIFE-CYCLE --------------- //
var onceConnectionOpen = function(event) {
  socketEvents.removeListener('error', onceConnectionError)
  exports.log('socket connected')

  socketEvents.once('command:connect', function(msg) {
    if (msg.status === 0) {
      socketEvents.on('command:message', onMessageCommand)
      socketEvents.on('command:blobFromServer', _.bind(blobTransaction.receive, blobTransaction))
      socketEvents.on('error', onError)
      socketEvents.on('close', onClose)
      socketEvents.on('close', onConnectionLost)
      exports.userId = msg.userId
      socketEvents.emit('connection:success')
    } else if (msg.status === 1) {
      socket.close()
      forgetSocket()
      socketEvents.emit('connection:failure', msg.error)
    }
  })

}

var onceConnectionError = function(event) {
  socketEvents.removeListener('open', onceConnectionOpen)
  socketEvents.emit('connection:failure', event.toString())
}

var onConnectionLost = function(event) {
  exports.emit('connection lost')
  socketEvents.removeListener('close', onConnectionLost)
}

var onReconnected = function() {
  exports.emit('reconnected')
}

var onMessage = function(event) {
  if (!(event.data instanceof Blob)) {
    var msg = JSON.parse(event.data)
    socketEvents.emit('command:' + msg.command, msg)
  } else socketEvents.emit('blob', event.data)
}

var onMessageCommand = function(msg) {
  exports.log('socket message received')
  exports.emit('message', msg.address, msg.args)
}

var onError = function(event) {
  exports.log('socket error ' + event.toString())
}

var onClose = function(event) {
  exports.log('socket closed')
}


// --------------- MISC HELPERS --------------- //
var _cbOrThrow = function(done, err) {
  if ((!err) && done) done(null)
  else {
    err = (err instanceof Error) ? err : new Error(err)
    if (done) done(err)
    else throw err
  }
}

var _assertValid = function(func, value) {
  var err = func(value)
  if (err !== null) throw new Error(err)
}

var _proxyOpen = function(event) { socketEvents.emit('open', event) }
var _proxyClose = function(event) { socketEvents.emit('close', event) }
var _proxyError = function(event) { socketEvents.emit('error', event) }