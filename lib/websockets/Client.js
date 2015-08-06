/*
 * Copyright 2014-2015, Sébastien Piquemal <sebpiq@gmail.com>
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

var EventEmitter = require('events').EventEmitter
  , querystring = require('querystring')
  , Buffer = require('buffer').Buffer
  , _ = require('underscore')
  , WebSocket = require('ws') // polyfilling not required -> https://github.com/einaros/ws/blob/master/lib/browser.js
  , expect = require('chai').expect
  , oscMin = require('osc-min')
  , cookies = require('cookies-js')
  , coreMessages = require('../core/messages')
  , coreValidation = require('../core/validation')
  , isBrowser = typeof window !== 'undefined'

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
  this._socketEmitter = null    // socket-level event emitter
  this._rhizomeEmitter = null   // Rhizome-level event emitter
  this.id = null                // Unique id of the client
  this._config = config         // Set config defaults
  this._isBrowser = isBrowser   // little to trick to allow testing some features
  this._reconnectTimeout = null // Handle to cancel the reconnection timeout

  // Binding event handlers to allow `removeListener`
  this._onConnectionLost = _.bind(this._onConnectionLost, this)
}


_.extend(Client.prototype, EventEmitter.prototype, coreValidation.ValidateConfigMixin, {

  // ========================= PUBLIC API ========================= //

  // Starts the client, calling `done(err)` when the client is connected, or when it failed to start.
  start: function(done) {
    var self = this
    if (!this.isSupported()) {
      var err = new NotSupported('the current browser is not supported')
      if (done) return done(err)
      else throw err
    }

    if (this._socket) {
      this._socket.close()
      this._clean()
    }

    this._validateConfig(function(err) {
      if (err) return done(err)
      if (self._isBrowser)
        self.id = cookies.get(self._config.cookieName) || null
      self._rhizomeEmitter = new EventEmitter

      var _connectCallback = function(err) {
        if (err) {
          if (done) return done(err)
          else throw err
        } else {
          // !!! We want to emit 'connected' only after the `done`
          if (done) done()
          self.emit('connected')
        }
      }

      if (self._config.reconnect)
        self._connectWithRetry(0, _connectCallback)
      else
        self._connect(_connectCallback)

    })
  },

  // Stops the client, calling `done(err)` when the connection was closed successfully.
  stop: function(done) {
    var self = this
    if (this._socket) {
      if (this._socket.readyState <= this._socket.OPEN) {
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
  send: function(address, args) {
    var self = this
    args = args || []
    if (_.isArray(args)) {
      args = _.map(args, function(arg) {
        if (arg instanceof ArrayBuffer)
          return new Buffer(new Uint8Array(arg))
        else return arg
      })
    }
    _assertValid(coreMessages.validateAddressForSend, address)
    _assertValid(coreMessages.validateArgs, args)
    this._socket.send(oscMin.toBuffer({ address: address, args: args }))
  },

  // Returns the current status of the client. Values can be `stopped` or `started`.
  status: function() {
    if (this._socket) {
      if (this.id === null) return 'stopped'
      else return wsStates[this._socket.readyState]
    } else return 'stopped'
  },

  // This function returns `true` if the web client is supported by the current browser, `false` otherwise.
  isSupported: function() { 
    if (this._isBrowser) 
      return Modernizr.websocketsbinary
    else return true
  },

  // This function is used by the client to log events. By default it is a no-op.
  log: function() {},


  // ========================= PRIVATE API ========================= //
  _connect: function(done) {
    var self = this
      , query = {}
      , url
    if (this.id) query.id = this.id
    if (this._isBrowser) {
      // `global` here is to allow testing
      query.os = (typeof window === 'undefined' ? global: window).navigator.oscpu
      query.browser = (typeof window === 'undefined' ? global: window).navigator.userAgent
    }

    // Create the socket and setup `_socketEmitter` to emit its events
    url = 'ws://' + this._config.hostname + ':' + this._config.port + '/'
      + '?' + querystring.stringify(query)
    this.log('connecting to ' + url)
    this._socket = new WebSocket(url)
    this._socket.binaryType = 'arraybuffer'
    this._socketEmitter = new EventEmitter()
    this._socket.onerror = function(event) { self._socketEmitter.emit('error') }
    this._socket.onmessage = function(event) { self._socketEmitter.emit('message', event.data) }
    this._socket.onclose = function(event) { self._socketEmitter.emit('close') }
    this._socket.onopen = function(event) { self._socketEmitter.emit('open') }

    // Bind event handlers for socket events
    this._socketEmitter.on('message', _.bind(this._onSocketMessage, this))
    
    this._socketEmitter.once('open', function(event) {
      self._socketEmitter.removeAllListeners('error')
      self._socketEmitter.on('error', _.bind(self._onSocketError, self))
      self._rhizomeEmitter.once(coreMessages.connectionStatusAddress, function(args) {
        var statusCode = args[0]

        // If `statusCode` is 0, connection succeeded
        if (statusCode === 0) {
          self.id = args[1]
          self._socketEmitter.once('close', self._onConnectionLost)
          if (self._isBrowser)
            cookies.set(self._config.cookieName, self.id)
          if (done) return done()

        // If `statusCode` is 1, the server is full
        } else if (statusCode === 1) 
          return done(new ConnectionRefused(statusCode, args[1]))

      })
    })

    this._socketEmitter.once('error', function(event) {
      self._socketEmitter.removeAllListeners('open')
      done(new Error('socket error'))
    })
  },

  _connectWithRetry: function(time, done) {
    var self = this
    this._reconnectTimeout = setTimeout(function() {
      // It could happen that this callback is in the event queue 
      // right after a call to the `Client.stop` method.
      // The followiung test makes sure that if `Client.stop` has been called,
      // we don't execute the reconnection.
      if (!self._reconnectTimeout) return
      self._reconnectTimeout = null
      self.log('socket reconnecting')
      self._connect(function(err) {
        if (err) {
          self.log('socket failed reconnecting ' + err.toString())
          if (err instanceof ConnectionRefused) {
            if (err.code === 1) self.emit('server full')
          }
          self._connectWithRetry(self._config.reconnect, done)
        } else done()
      })

    }, time)
  },

  _clean: function() {
    this.id = null
    if (this._reconnectTimeout) {
      clearTimeout(this._reconnectTimeout)
      this._reconnectTimeout = null
    }
    this._socketEmitter.removeAllListeners()
    this._rhizomeEmitter = null
    this._socket = null
    this._socketEmitter = null
  },

  configValidator: new coreValidation.ChaiValidator({
    port: function(val) {
      expect(val).to.be.a('number')
      expect(val).to.be.within(0, 65535)
    },
    hostname: function(val) {
      expect(val).to.be.a('string')
    },
    reconnect: function(val) {
      expect(val).to.be.a('number')
    },
    cookieName: function(val) {
      expect(val).to.be.a('string')
    },
    useCookies: function(val) {
      expect(val).to.be.a('boolean')
    }
  }),

  configDefaults: {
    reconnect: 2000,
    cookieName: 'rhizome',
    useCookies: true
  },

  // --------------- EVENT HANDLERS --------------- //
  _onConnectionLost: function(event) {
    var self = this
    this.emit('connection lost')
    this._rhizomeEmitter.removeAllListeners()
    if (this._config.reconnect) {
      this._connectWithRetry(0, function(err) {
        if (err) throw err
        self.emit('connected')
      })
    }
  },

  _onSocketError: function(err) {
    // If there's no listener, we don't want an error to be thrown
    if (this.listeners('error').length)
      this.emit('error', err)
    this.log('socket error ', err.toString())
  },

  _onSocketMessage: function(data) {
    var msg = oscMin.fromBuffer(data)
      , address = msg.address
      , args = _.pluck(msg.args, 'value')
    if (address === coreMessages.connectionStatusAddress)
      this._rhizomeEmitter.emit(address, args)
    else this.emit('message', address, args)
  }

})

// --------------- MISC --------------- //
var _assertValid = function(func, value) {
  var err = func(value)
  if (err !== null) throw new Error(err)
}

// Error for when the config of an object is not valid
var ConnectionRefused = function ConnectionRefused(code, message) {
  this.code = code
  this.message = message
}
ConnectionRefused.prototype = Object.create(Error.prototype)
ConnectionRefused.prototype.name = 'ConnectionRefused'

// Error for when the client is not supported
var NotSupported = function NotSupported(message) {
  this.message = message
}
NotSupported.prototype = Object.create(Error.prototype)
NotSupported.prototype.name = 'NotSupported'