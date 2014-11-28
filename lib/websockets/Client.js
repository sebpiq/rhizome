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
  , expect = require('chai').expect
  , coreMessages = require('../core/messages')
  , coreUtils = require('../core/utils')
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

var Client = module.exports = function(config) {
  EventEmitter.apply(this)
  this._socket = null
  this._socketEmitter = null
  this._rhizomeEvents = null
  this._blobTransaction = null

  // Unique id of the client
  this.userId = null

  // Set config defaults
  this._config = config

  // Binding event handlers to allow `removeListener`
  this._onConnectionLost = _.bind(this._onConnectionLost, this)
}


_.extend(Client.prototype, EventEmitter.prototype, coreUtils.ValidateConfigMixin, {

  // ========================= PUBLIC API ========================= //

  // Starts the client, calling `done(err)` when the client is connected, or when it failed to start.
  start: function(done) {
    var self = this
    if (!this.isSupported()) {
      var err = new Error('the current browser is not supported')
      if (done) done(err)
      else throw err
    }

    if (this._socket) {
      this._socket.close()
      this._clean()
    }

    this._validateConfig(function(err) {
      if (err) return done(err)

      self._rhizomeEvents = new EventEmitter
      self._connect(function(err) {
        if (!err) self.emit('connected')
        if (done) done(err)
      })

      self._rhizomeEvents.once('connection:success', function() {
        self._rhizomeEvents.removeAllListeners('connection:failure')

      })

      self._rhizomeEvents.once('connection:failure', function(err) {
        self._rhizomeEvents.removeAllListeners('connection:success')
        if (done) done(err)
      })

    })
  },

  // Stops the client, calling `done(err)` when the connection was closed successfully.
  stop: function(done) {
    var self = this
    if (this._socket) {
      if (this._socket.readyState === this._socket.OPEN) {
        // If reconnection is armed, we need to cancel it immediately or it will be triggered
        // when the socket is done closing.
        this._socketEmitter.removeListener('close', this._onConnectionLost)
        this._socket.close()
        this._socketEmitter.once('close', function() {
          self._clean()
          if (done) done(null)
        })
      } else {
        this._clean()
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

  // This function returns `true` if the web client is supported by the current browser, `false` otherwise.
  isSupported: function() { return _.isFunction(WebSocket) && WebSocket.prototype.CLOSING === 2 },

  // This function is used by the client to log events. By default it is a no-op.
  log: function() {},


  // ========================= PRIVATE API ========================= //
  _connect: function(done) {
    var self = this
    this._socket = new WebSocket('ws://' + this._config.hostname + ':' + this._config.port + '/'
      + '?' + 'queueIfFull=' + JSON.stringify(this._config.queueIfFull))
    this._socketEmitter = new EventEmitter()
    this._socket.onerror = function(event) { self._socketEmitter.emit('error') }
    this._socket.onmessage = function(event) { self._socketEmitter.emit('message', event.data) }
    this._socket.onclose = function(event) { self._socketEmitter.emit('close') }
    this._socket.onopen = function(event) { self._socketEmitter.emit('open') }

    this._blobTransaction = new BlobTransaction(this._socket, 'blobFromWeb', 'blobFromServer', this._rhizomeEvents)

    this._socketEmitter.on('message', _.bind(this._onSocketMessage, this))

    this._socketEmitter.once('open', function(event) {
      self._socketEmitter.removeAllListeners('error')
      self._socketEmitter.on('error', _.bind(self._onSocketError, self))
      self._rhizomeEvents.once('command:connect', _.bind(self._doRhizomeConnection, self, done))
    })

    this._socketEmitter.once('error', function(event) {
      self._socketEmitter.removeAllListeners('open')
      done(new Error('socket error'))
    })
  },

  _reconnect: function() {
    var self = this
    setTimeout(function() {
      self.log('socket reconnecting')
      self._connect(function(err) {
        if (err) {
          self.log('socket failed reconnecting ' + err.toString())
          self._reconnect()
        } else self.emit('connected')
      })

    }, this._config.reconnect)
  },

  _clean: function() {
    this.userId = null
    this._socketEmitter.removeAllListeners()
    this._rhizomeEvents = null
    this._socket = null
    this._socketEmitter = null
  },

  configValidator: new coreUtils.ChaiValidator({
    port: function(val) {
      expect(val).to.be.a('number')
      expect(val).to.be.within(1025, 49150)
    },
    hostname: function(val) {
      expect(val).to.be.a('string')
    },
    reconnect: function(val) {
      expect(val).to.be.a('number')
    },
    queueIfFull: function(val) {
      expect(val).to.be.a('boolean')
    }
  }),

  configDefaults: {
    reconnect: 1000,
    queueIfFull: true
  },

  // --------------- EVENT HANDLERS --------------- //
  _onConnectionLost: function(event) {
    this.emit('connection lost')
    this._rhizomeEvents.removeAllListeners()
    if (this._config.reconnect) this._reconnect()
  },

  _doRhizomeConnection: function(done, msg) {
    // if `status` is 0, connection succeeded
    if (msg.status === 0) {
      this._rhizomeEvents.on('command:message', _.bind(this._onMessageCommand, this))
      this._rhizomeEvents.on('command:blobFromServer', _.bind(this._blobTransaction.receive, this._blobTransaction))
      this._socketEmitter.once('close', this._onConnectionLost)
      this.userId = msg.userId
      if (done) done()

    } else if (msg.status === 1) {
      
      // If the server is full and the client wants to queue, we wait for the server
      // to send a new 'connect' command.
      if (this._config.queueIfFull) {
        this.emit('queued')
        this._rhizomeEvents.once('command:connect', _.bind(this._doRhizomeConnection, this, done))

      // Otherwise, we don't queue, close the connection and return an error as the connection failed.
      } else {
        if (done)
          this._socketEmitter.once('close', done.bind(this, new Error(msg.error)))
        this._socket.close()
      }
    }
  },

  _onMessageCommand: function(msg) {
    this.log('socket message received')
    this.emit('message', msg.address, msg.args)
  },

  _onSocketError: function(err) {
    // If there's no listener, we don't want an error to be thrown
    if (this.listeners('error').length)
      this.emit('error', err)
    this.log('socket error ', err.toString())
  },

  _onSocketMessage: function(data) {
    if (!(data instanceof Blob)) {
      var msg = JSON.parse(data)
      this._rhizomeEvents.emit('command:' + msg.command, msg)
    } else this._rhizomeEvents.emit('blob', data)
  }

})


// --------------- MISC HELPERS --------------- //
var _assertValid = function(func, value) {
  var err = func(value)
  if (err !== null) throw new Error(err)
}