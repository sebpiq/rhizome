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
var socket, nsTree, waitReconnect

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

  createSocket(done)

  if (exports.config.reconnect) {
    waitReconnect = _waitEvent('close', function(event) { setTimeout(reconnect, exports.config.reconnect) })
  } else socket.addEventListener('close', onClose, false)
}

// Stops the client, calling `done(err)` when the connection was closed successfully.
exports.stop = function(done) {
  // If this is set, we need to cancel it immediately or it will be triggered
  // when the socket is done closing.
  if (waitReconnect) {
    waitReconnect.cancel()
    waitReconnect = null
  }
  if (socket && socket.readyState === socket.OPEN) {
    socket.close()
    _waitEvent('close', function() {
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
    doBlobTransaction(address, args)
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
  _waitCommand('subscribe', function(msg) {
    if (msg.status === 0) {
      if (done) done(null)
    } else return _cbOrThrow(done, msg.error)
  })
}

var createSocket = function(done) {
  socket = new WebSocket(wsUrl)
  var waitOpen, waitError

  waitOpen = _waitEvent('open', function(event) {
    waitError.cancel()
    socket.addEventListener('error', onError, false)
    socket.addEventListener('close', onClose, false)
    exports.debug('socket connected')

    _waitCommand('connect', function(msg) {
      if (msg.status === 0) {
        socket.addEventListener('message', onMessage, false)
        exports.userId = msg.userId
        if (done) done(null)
      } else if (msg.status === 1) {
        socket.close()
        forgetSocket()
        _cbOrThrow(done, msg.error)
      }
    })

  })

  waitError = _waitEvent('error', function(event) {
    waitOpen.cancel()
    _cbOrThrow(done, event.toString())
  })
}

var reconnect = function() {
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
      waitReconnect = _waitEvent('close', function(event) { setTimeout(reconnect, exports.config.reconnect) })
    }
  })
}

// Since we can't send text with binary data, we need to send the text and blobs separately,
// and make sure that the message is reconstructed properly on the other side.
var doBlobTransaction = function(address, args) {
  _blobQueue.push({address: address, args: args})
  if ((!_sendBlobsLock) && _blobQueue.length > 0) {
    _sendBlobsLock = true
    var msg = _blobQueue.shift()
      , args = msg.args
      , blobs = [], blobArgIndices = []

    // Isolate the blobs from the other message arguments
    _.forEach(args, function(arg, i) {
      if (arg instanceof Blob) {
        blobs.push(arg)
        blobArgIndices.push(i)
        args[i] = null
      }
    })

    // Send first the data about the original message.
    sendJSON(socket, {command: 'blob', address: msg.address, args: args, blobArgIndices: blobArgIndices})

    // and then send all the blobs one by one.
    _waitCommand('blob', function(msg) { _sendCurrentBlobs() })
    var _sendCurrentBlobs = function() {
      socket.send(blobs.shift())
      _waitCommand('blob', function(msg) {
        if (blobs.length) _sendCurrentBlobs() 
        else {
          // The whole message and blobs have been sent, so it is safe to unlock.
          _sendBlobsLock = false
          if (msg.status === 0) doBlobTransaction()
          else throw new Error(msg.error) // TODO: better handling
        }
      })
    }
  }
}
// `_sendBlobsLock` helps to make sure that there isn't several blob messages being sent in parallel.
var _sendBlobsLock = false
  , _blobQueue = []

var onMessage = function(event) {
  if (event.data instanceof Blob) 1//TODO this.emit('blob', event.data)
  else {
    var msg = JSON.parse(event.data)
    if (msg.command === 'message') {
      exports.debug('socket message received')
      nsTree.get(msg.address, function(ns) {
        _.forEach(ns.data.handlers, function(handler) {
          handler(msg.address, msg.args)
        })
      })
    }
  }
}

var onError = function(event) {
  exports.debug('socket error ' + event.toString())
}

var onClose = function(event) {
  exports.debug('socket closed')
}

var forgetSocket = function() {
  exports.userId = null
  if (waitReconnect) waitReconnect.cancel()
  socket.removeEventListener('message', onMessage, false)
  socket.removeEventListener('error', onError, false)
  socket.removeEventListener('close', onClose, false)
  socket = null
}

// ------------------------- Misc helpers ------------------------- //
var Wait = function(name, handler) {
  this.handler = handler
  this.name = name
}

_.extend(Wait.prototype, {
  cancel: function() {
    socket.removeEventListener(this.name, this.handler, false)
  }
})

var _waitEvent = function(name, handler) {
  var _handler = function(event) {
    wait.cancel()
    handler.call(this, event)
  }
  var wait = new Wait(name, _handler)
  socket.addEventListener(name, _handler, false)
  return wait
}

var _waitCommand = function(command, handler) {
  var _handler = function(event) {
    if (!(event.data instanceof Blob)) {
      var msg = JSON.parse(event.data)
      if (msg.command === command) {
        wait.cancel()
        handler.call(this, msg)
      }
    }
  }
  var wait = new Wait('message', _handler)
  socket.addEventListener('message', _handler, false)
  return wait
}

var _cbOrThrow = function(done, err) {
  if (!(err instanceof Error)) err = new Error(err)
  if (done) done(err)
  else throw err
}

var _assertValidAddress = function(address) {
  var addressErr = shared.validateAddress(address)
  if (addressErr !== null) throw new Error(addressErr)
}
