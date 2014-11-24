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
  , EventEmitter = require('events').EventEmitter
  , WebSocket = require('ws') // polyfilling not required -> https://github.com/einaros/ws/blob/master/lib/browser.js
  , coreMessages = require('../core/messages')
  , sendJSON = require('./utils').sendJSON
  , BlobTransaction = require('./utils').BlobTransaction
  , isBrowser = typeof window !== 'undefined'
  , Blob = isBrowser ? window.Blob : Buffer

// Maps socket state to client status
if (WebSocket) {
  var wsStates = _.object([
    [WebSocket.CONNECTING, 'stopped'],
    [WebSocket.OPEN, 'started'],
    [WebSocket.CLOSING, 'stopped'],
    [WebSocket.CLOSED, 'stopped']
  ])
}

var Client = module.exports = function() {
  EventEmitter.apply(this)
  this._socket = null
  this._socketEvents = null
  this._blobTransaction = null

  // Unique id of the client
  this.userId = null

  this._config = {
    reconnect: 1000,
    queueIfFull: true,
    port: isBrowser ? window.location.port : null,
    hostname: isBrowser ? window.location.hostname : null
  }

  // Binding event handlers to help with addListener / removeListener
  this._onConnectionOpen = this._onConnectionOpen.bind(this)
  this._onConnecti_onError = this._onConnecti_onError.bind(this)
  this._onConnectionLost = this._onConnectionLost.bind(this)
  this._onReconnected = this._onReconnected.bind(this)
  this._onConnectCommand = this._onConnectCommand.bind(this)
  this._onMessageCommand = this._onMessageCommand.bind(this)
  this._onError = this._onError.bind(this)
  this._onClose = this._onClose.bind(this)

  this._proxyOpen = this._proxyOpen.bind(this)
  this._proxyClose = this._proxyClose.bind(this)
  this._onMessage = this._onMessage.bind(this)
  this._proxyError = this._proxyError.bind(this)
}

// This function returns `true` if the web client is supported by the current browser, `false` otherwise.
Client.isSupported = function() { return _.isFunction(WebSocket) && WebSocket.prototype.CLOSING === 2 }


_.extend(Client.prototype, EventEmitter.prototype, {

  // ========================= PUBLIC API ========================= //
  // Configuration of the client
  config: function(name, value) {

    // Sets the time to wait before attempting reconnection.
    if (name === 'reconnect') {
      if (_.isNumber(value)) this._config.reconnect = value
      else throw new Error('`reconnect` should be a number')
    }

    // Queue if the server is full  
    else if (name === 'queueIfFull') {
      if (!this._socket) {
        if (_.isBoolean(value)) this._config.queueIfFull = value
        else throw new Error('`queueIfFull` should be boolean')
      } else throw new Error('this setting cannot be changed once the client is started')
    }

    // Set the server port
    else if (name === 'port') {
      if (!this._socket) {
        if (_.isNumber(value)) this._config.port = value
        else throw new Error('`port` should be a number')
      } else throw new Error('this setting cannot be changed once the client is started')
    }

    // Set the server hostname
    else if (name === 'hostname') {
      if (!this._socket) {
        if (_.isString(value)) this._config.hostname = value
        else throw new Error('`hostname` should be a string')
      } else throw new Error('this setting cannot be changed once the client is started')
    }

  },

  // Starts the client, calling `done(err)` when the client is connected, or when it failed to start.
  start: function(done) {
    var self = this
    if (!Client.isSupported())
      _cbOrThrow(done, 'the current browser is not supported')

    if (this._socket) {
      this._socket.close()
      this._disconnect()
    }
    this._socketEvents = new EventEmitter
    this._connect()

    this._socketEvents.once('connection:success', function() {
      self._socketEvents.removeAllListeners('connection:failure')
      self.emit('connected')
      if (done) done()
    })

    this._socketEvents.once('connection:failure', function(err) {
      self._socketEvents.removeAllListeners('connection:success')
      // When a 'connection:failure' comes in, there was a socket error, and therefore
      // we don't need to `emit('error')` on the client, as this is already handled in `_onError`
      if (done) done(err)
    })
  },

  // Stops the client, calling `done(err)` when the connection was closed successfully.
  stop: function(done) {
    var self = this
    if (this._socket) {
      if (this._socket.readyState === this._socket.OPEN) {
        // If reconnection is armed, we need to cancel it immediately or it will be triggered
        // when the socket is done closing.
        this._socketEvents.removeListener('close', this._onConnectionLost)
        this._socket.close()
        this._socketEvents.once('close', function() {
          self._disconnect()
          if (done) done(null)
        })
      } else {
        this._disconnect()
        if (done) done(null)
      }
    } else if (done) done(null)
  },

  // Sends a message to OSC `address`, with arguments `args`, 
  // or if `address` is a blob address, `args` is interpreted as a single blob. 
  send: function(address, args) {
    var self = this
    args = args || []
    _assertValid(coreMessages.validateAddressForSend, address)
    _assertValid(coreMessages.validateArgs, args)
    if (_.some(args, function(arg) { return arg instanceof Blob })) {
      self._blobTransaction.send(address, args)
    } else sendJSON(this._socket, {command: 'message', address: address, args: args})
  },

  // Returns the current status of the client. Values can be `stopped` or `started`.
  status: function() {
    if (this._socket) {
      if (this.userId === null) return 'stopped'
      else return wsStates[this._socket.readyState]
    } else return 'stopped'
  },

  // This function is used by the client to log events. By default it is a no-op.
  log: function() {},


  // ========================= PRIVATE API ========================= //
  _connect: function() {
    this._socket = new WebSocket('ws://' + this._config.hostname + ':' + this._config.port + '/'
      + '?' + 'queueIfFull=' + JSON.stringify(this._config.queueIfFull))
    this._blobTransaction = new BlobTransaction(this._socket, 'blobFromWeb', 'blobFromServer', this._socketEvents)

    this._socket.addEventListener('open', this._proxyOpen, false)
    this._socket.addEventListener('close', this._proxyClose, false)
    this._socket.addEventListener('message', this._onMessage, false)
    this._socket.addEventListener('error', this._proxyError, false)

    this._socketEvents.once('open', this._onConnectionOpen)
    this._socketEvents.once('error', this._onConnecti_onError)
  },

  _disconnect: function() {
    this.userId = null

    this._socket.removeEventListener('open', this._proxyOpen, false)
    this._socket.removeEventListener('close', this._proxyClose, false)
    this._socket.removeEventListener('message', this._onMessage, false)
    this._socket.removeEventListener('error', this._proxyError, false)

    this._socketEvents = null
    this._socket = null
  },

  _reconnect: function() {
    var self = this
    setTimeout(function() {
      self.log('socket reconnecting')
      self._connect()

      self._socketEvents.once('connection:success', function() {
        self._socketEvents.removeAllListeners('connection:failure')
        self._onReconnected()
      })
      
      self._socketEvents.once('connection:failure', function(err) {
        self._socketEvents.removeAllListeners('connection:success')
        self.log('socket failed reconnecting ' + err.toString())
        setTimeout(self._reconnect.bind(self), self._config.reconnect)
      })

    }, this._config.reconnect)
  },

  // --------------- LIFE-CYCLE --------------- //
  _onConnectionOpen: function(event) {
    this._socketEvents.removeListener('error', this._onConnecti_onError)
    this._socketEvents.once('command:connect', this._onConnectCommand)
    this.log('socket connected')
  },

  _onConnecti_onError: function(event) {
    this._socketEvents.removeListener('open', this._onConnectionOpen)
    this._socketEvents.emit('connection:failure', new Error('socket error'))
  },

  _onConnectionLost: function(event) {
    this.emit('connection lost')
    this._socketEvents.removeAllListeners()
    if (this._config.reconnect) this._reconnect()
  },

  _onReconnected: function() {
    this.emit('reconnected')
  },

  _onConnectCommand: function(msg) {
    if (msg.status === 0) {
      this._socketEvents.on('command:message', this._onMessageCommand)
      this._socketEvents.on('command:blobFromServer', _.bind(this._blobTransaction.receive, this._blobTransaction))
      this._socketEvents.on('error', this._onError)
      this._socketEvents.on('close', this._onClose)
      this._socketEvents.once('close', this._onConnectionLost)
      this.userId = msg.userId
      this._socketEvents.emit('connection:success')

    } else if (msg.status === 1) {
      this.emit('server full')
      if (this._config.queueIfFull) this._socketEvents.once('command:connect', this._onConnectCommand)
      else {
        this._socketEvents.emit('connection:failure', msg.error)
        this._socket.close()
        this._disconnect()
      }
    }
  },

  _onMessageCommand: function(msg) {
    this.log('socket message received')
    this.emit('message', msg.address, msg.args)
  },

  _onError: function(err) {
    // If there's no listener, we don't want an error to be thrown
    if (this.listeners('error').length)
      this.emit('error', err)
    this.log('socket error ', err.toString())
  },

  _onClose: function(event) {
    this.log('socket closed')
  },

  // --------------- SOCKET EVENT HANDLERS --------------- //
  _proxyOpen: function(event) { this._socketEvents.emit('open', event) },
  _proxyClose: function(event) { this._socketEvents.emit('close', event) },
  _proxyError: function(event) {
    // Unfortunately, when receiving an error, there is no extra info about what that error is :
    // http://www.w3.org/TR/websockets/#concept-websocket-close-fail
    this._socketEvents.emit('error', new Error('socket error'))
  },
  _onMessage: function(event) {
    if (!(event.data instanceof Blob)) {
      var msg = JSON.parse(event.data)
      this._socketEvents.emit('command:' + msg.command, msg)
    } else this._socketEvents.emit('blob', event.data)
  }

})


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
