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
  , wsUrl = isBrowser ? ('ws://' + window.location.hostname + ':' + window.location.port + '/') : 'ws://localhost:8000/'

// Context variables
var socket, socketEvents, blobTransaction

// Maps socket state to client status
if (WebSocket) {
  var wsStates = _.object([
    [WebSocket.CONNECTING, 'stopped'],
    [WebSocket.OPEN, 'started'],
    [WebSocket.CLOSING, 'stopped'],
    [WebSocket.CLOSED, 'stopped']
  ])
}


// ========================= PUBLIC API ========================= //
// Unique id of the client
exports.userId = null

// Configuration of the client
exports.config = {

  // Sets the `time` to wait before attempting reconnection.
  reconnect: function(time) {
    if (_.isNumber(time)) {
      config.reconnect = time
    } else throw new Error('`time` should be a number')
  },

  // Queue if the server is full
  queueIfFull: function(value) {
    if (!socket) {
      if (_.isBoolean(value)) {
        config.queueIfFull = value
      } else throw new Error('`queueIfFull` should be boolean')
    } else throw new Error('this setting cannot be changed once the client is started')
  }

}
var config = {
  reconnect: 1000,
  queueIfFull: true
}

// Starts the client, calling `done(err)` when the client is connected, or when it failed to start.
exports.start = function(done) {
  if (!exports.isSupported())
    _cbOrThrow(done, 'the current browser is not supported')

  if (socket) {
    socket.close()
    disconnect()
  }
  socketEvents = new EventEmitter
  connect()

  socketEvents.once('connection:success', function() {
    socketEvents.removeAllListeners('connection:failure')
    exports.emit('connected')
    if (done) done()
  })

  socketEvents.once('connection:failure', function(err) {
    socketEvents.removeAllListeners('connection:success')
    // When a 'connection:failure' comes in, there was a socket error, and therefore
    // we don't need to `emit('error')` on `exports`, as this is already handled in `onError`
    if (done) done(err)
  })
}

// Stops the client, calling `done(err)` when the connection was closed successfully.
exports.stop = function(done) {
  if (socket) {
    if (socket.readyState === socket.OPEN) {
      // If reconnection is armed, we need to cancel it immediately or it will be triggered
      // when the socket is done closing.
      socketEvents.removeListener('close', onConnectionLost)
      socket.close()
      socketEvents.once('close', function() {
        disconnect()
        if (done) done(null)
      })
    } else {
      disconnect()
      if (done) done(null)
    }
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
  if (socket) {
    if (exports.userId === null) return 'stopped'
    else return wsStates[socket.readyState]
  } else return 'stopped'
}

// This function is used by the client to log events. By default it is a no-op.
exports.log = function() {}

// This function returns `true` if the web client is supported by the current browser, `false` otherwise.
exports.isSupported = function() { return _.isFunction(WebSocket) && WebSocket.prototype.CLOSING === 2 }


// ========================= PRIVATE API ========================= //
var connect = function() {
  socket = new WebSocket(wsUrl + '?' + 'queueIfFull=' + JSON.stringify(config.queueIfFull))
  blobTransaction = new shared.BlobTransaction(socket, 'blobFromWeb', 'blobFromServer', socketEvents)

  socket.addEventListener('open', _proxyOpen, false)
  socket.addEventListener('close', _proxyClose, false)
  socket.addEventListener('message', _onMessage, false)
  socket.addEventListener('error', _proxyError, false)

  socketEvents.once('open', onConnectionOpen)
  socketEvents.once('error', onConnectionError)
}

var disconnect = function() {
  exports.userId = null

  socket.removeEventListener('open', _proxyOpen, false)
  socket.removeEventListener('close', _proxyClose, false)
  socket.removeEventListener('message', _onMessage, false)
  socket.removeEventListener('error', _proxyError, false)

  socketEvents = null
  socket = null
}

var reconnect = function() {
  setTimeout(function() {
    exports.log('socket reconnecting')
    connect()

    socketEvents.once('connection:success', function() {
      socketEvents.removeAllListeners('connection:failure')
      onReconnected()
    })
    
    socketEvents.once('connection:failure', function(err) {
      socketEvents.removeAllListeners('connection:success')
      exports.log('socket failed reconnecting ' + err.toString())
      setTimeout(reconnect, config.reconnect)
    })

  }, config.reconnect)
}


// --------------- LIFE-CYCLE --------------- //
var onConnectionOpen = function(event) {
  socketEvents.removeListener('error', onConnectionError)
  socketEvents.once('command:connect', onConnectCommand)
  exports.log('socket connected')
}

var onConnectionError = function(event) {
  socketEvents.removeListener('open', onConnectionOpen)
  socketEvents.emit('connection:failure', new Error('socket error'))
}

var onConnectionLost = function(event) {
  exports.emit('connection lost')
  if (config.reconnect) reconnect()
}

var onReconnected = function() {
  exports.emit('reconnected')
}

var onConnectCommand = function(msg) {
  if (msg.status === 0) {
    socketEvents.on('command:message', onMessageCommand)
    socketEvents.on('command:blobFromServer', _.bind(blobTransaction.receive, blobTransaction))
    socketEvents.on('error', onError)
    socketEvents.on('close', onClose)
    socketEvents.once('close', onConnectionLost)
    exports.userId = msg.userId
    socketEvents.emit('connection:success')

  } else if (msg.status === 1) {
    exports.emit('server full')
    if (config.queueIfFull) socketEvents.once('command:connect', onConnectCommand)
    else {
      socketEvents.emit('connection:failure', msg.error)
      socket.close()
      disconnect()
    }
  }
}

var onMessageCommand = function(msg) {
  exports.log('socket message received')
  exports.emit('message', msg.address, msg.args)
}

var onError = function(err) {
  // If there's no listener, we don't want an error to be thrown
  if (exports.listeners('error').length)
    exports.emit('error', err)
  exports.log('socket error ', err.toString())
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
var _proxyError = function(event) {
  // Unfortunately, when receiving an error, there is no extra info about what that error is :
  // http://www.w3.org/TR/websockets/#concept-websocket-close-fail
  socketEvents.emit('error', new Error('socket error'))
}
var _onMessage = function(event) {
  if (!(event.data instanceof Blob)) {
    var msg = JSON.parse(event.data)
    socketEvents.emit('command:' + msg.command, msg)
  } else socketEvents.emit('blob', event.data)
}
