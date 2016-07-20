/*
 * Copyright 2014-2016, Sébastien Piquemal <sebpiq@gmail.com>
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
"use strict";

var EventEmitter = require('events').EventEmitter
  , querystring = require('querystring')
  , Buffer = require('buffer').Buffer
  , _ = require('underscore')
  , WebSocket = require('ws')
  , expect = require('chai').expect
  , oscMin = require('osc-min')
  , cookies = require('cookies-js')
  , coreMessages = require('../core/messages')
  , coreValidation = require('../core/validation')
  , isBrowser = typeof window !== 'undefined'
if (isBrowser) WebSocket = global.WebSocket

var Client = module.exports = function(config) {
  EventEmitter.apply(this)
  this._socket = null
  this.id = null                // Unique id of the client
  this._config = config         // Set config defaults
  this._isBrowser = isBrowser   // little to trick to allow testing some features
  this._reconnectTimeout = null // Handle to cancel the reconnection timeout
}

_.extend(Client.prototype, EventEmitter.prototype, coreValidation.ValidateConfigMixin, {

  // ========================= PUBLIC API ========================= //

  // Starts the client, calling `done(err)` when the client is connected, or when it failed to start.
  start: function(done) {
    this.log('starting')
    var self = this
      , _returnErr = function(err) {
        if (done) return done(err)
        else throw err
      }

    if (!this.isSupported())
      return _returnErr(new NotSupported('the current browser is not supported'))

    if (this._socket) {
      this._socket.close()
      this._clean()
    }

    this.validateConfig(function(err) {
      if (err) return _returnErr(err)

      if (self._isBrowser)
        self.id = cookies.get(self._config.cookieName) || null

      var _connectCallback = function(err) {
        if (err) 
          return _returnErr(err)
        else {
          // !!! We want to emit 'connected' only after the `done`
          if (done) done()
          self.log('connected')
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
    this.log('stopping')
    var self = this
    if (this._socket) {
      
      var _onceClosed = function() {
        self._clean()
        self.log('stopped')
        if (done) done(null)
      }

      if (this._socket.readyState === this._socket.OPEN) {
        this._socket.onclose = _onceClosed
        this._socket.close()
       
      } else if (this._socket.readyState === this._socket.CONNECTING) {
        this._socket.close()
        _onceClosed()

      } else _onceClosed()

    } else if (done) done(null)
  },

  // Sends a message to OSC `address`, with arguments `args`, 
  send: function(address, args) {
    var self = this
      , buffer

    // Handle ArrayBuffers
    args = args || []
    if (_.isArray(args)) {
      args = _.map(args, function(arg) {
        if (arg instanceof ArrayBuffer)
          return new Buffer(new Uint8Array(arg))
        else return arg
      })
    }

    // Check that address is not a reserved address, and args are valid.
    var _assertValid = function(func, value) {
      var err = func(value)
      if (err !== null) throw new Error(err)
    }
    _assertValid(coreMessages.validateAddressForSend, address)
    _assertValid(coreMessages.validateArgs, args)
    
    // Browser version of `Buffer` is basically just a `Uint8Array` when typed arrays
    // are supported : https://github.com/feross/buffer/blob/master/index.js#L225
    // When they are not, `Buffer` is an object and sending it will cause
    // `Buffer.toString` to be called.
    buffer = oscMin.toBuffer({ address: address, args: args })
    buffer.toString = function() { return Buffer.prototype.toString.call(this, 'binary') }
    this._socket.send(buffer)
  },

  // Returns the current status of the client. Values can be `stopped` or `started`.
  status: function() {
    if (this._socket) {
      if (this.id === null) return 'stopped'
      else return _.contains([ this._socket.OPEN, this._socket.CONNECTING ], 
        this._socket.readyState) ? 'started' : 'stopped'
    } else return 'stopped'
  },

  // This function returns `true` if the web client is supported by the current browser, `false` otherwise.
  isSupported: function() { 
    if (this._isBrowser) 
      return rhizome.Modernizr.websocketsbinary
    else return true
  },

  // This function is used by the client to log events. By default it is a no-op.
  log: function() {},


  // ========================= PRIVATE API ========================= //

  _connect: function(done) {
    var self = this
      , url = this._getUrl()

    this.log('connecting to ' + url)
    this._socket = new WebSocket(url)
    this._socket.binaryType = 'arraybuffer'

    var _onCloseOrError = function() {
      self._clean()
      done(new Error('connect error'))
    }
    this._socket.onerror = _onCloseOrError
    this._socket.onclose = _onCloseOrError
    this._socket.onopen = function(event) {
      
      self._socket.onerror = function(err) {
        // If there's no listener, we don't want an error to be thrown
        if (self.listeners('error').length)
          self.emit('error', err)
        self.log('socket error ' + (err ? err.toString() : ''))
      }

      // Once socket has opened, we wait for connection status message,
      // to get an id and confirm that server has accepted socket connection.
      self._socket.onmessage = function(event) {
        var decoded = self._decodeMessage(event.data)

        if (decoded.address === coreMessages.connectionStatusAddress) {
          self._socket.onmessage = null
          var statusCode = decoded.args[0]

          // If `statusCode` is 0, connection succeeded
          if (statusCode === 0) {
            self.id = decoded.args[1]

            self._socket.onmessage = function(event) { 
              var decoded = self._decodeMessage(event.data)
              self.emit('message', decoded.address, decoded.args)
            }

            self._socket.onclose = function(event) {
              self.id = null
              self.emit('connection lost')
              if (self._config.reconnect) {
                self._connectWithRetry(0, function(err) {
                  if (err) throw err
                  self.log('connected')
                  self.emit('connected')
                })
              }
            }
            
            if (self._isBrowser)
              cookies.set(self._config.cookieName, self.id)
            if (done) return done()

          // If `statusCode` is 1, the server is full
          } else if (statusCode === 1) 
            return done(new ConnectionRefused(statusCode, decoded.args[1]))
        }
      }

    }
  },

  _connectWithRetry: function(time, done) {
    var self = this
    this._reconnectTimeout = setTimeout(function() {
      // It could happen that this callback is in the event queue 
      // right after a call to the `Client.stop` method.
      // The following test makes sure that if `Client.stop` has been called,
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
    // !!! Somehow the WebSocket - at least on node - might throw an (unhandled) error
    // if we assign `null` to handlers even after closed.
    this._socket.onclose = function() {}
    this._socket.onerror = function() {}
    this._socket.onopen = function() {}
    this._socket.onmessage = function() {}
    this._socket = null
  },

  _getUrl: function() {
    var query = {}
    if (this.id) query.id = this.id
    if (this._isBrowser) {
      query.os = global.navigator.oscpu || global.navigator.platform
      query.browser = global.navigator.userAgent
    }
    return this._config.protocol + '://' 
      + this._config.hostname + ':' + this._config.port
      + '/?' + querystring.stringify(query)
  },

  _decodeMessage: function(data) {
    var msg = oscMin.fromBuffer(data)
      , address = msg.address
      , args = _.pluck(msg.args, 'value')
    return { address: address, args: args }
  },

  configValidator: new coreValidation.ChaiValidator({
    protocol: function(val) {
      expect(val).to.be.a('string')
        .and.to.satisfy(function(val) { return _.contains(['ws', 'wss'], val) })
    },
    port: function(val) {
      expect(val).to.be.a('number')
        .and.to.be.within(0, 65535)
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
    port: (isBrowser ? 
      (window.location.port.length ? 
        parseInt(window.location.port, 10): ({'http:': 80, 'https:': 443})[window.location.protocol]
      )
      : undefined),
    protocol: isBrowser ? ({'http:': 'ws', 'https:': 'wss'})[window.location.protocol] : 'ws',
    hostname: isBrowser ? window.location.hostname : undefined,
    reconnect: 2000,
    cookieName: 'rhizome',
    useCookies: true
  }

})

// --------------- Error classes --------------- //
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
