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

var EventEmitter = require('events').EventEmitter
  , _ = require('underscore')
  , connections = require('../connections')
  , coreMessages = require('./messages')
  , coreUtils = require('./utils')


// Base class for different types of connections.
// Subclasses must implement at least `send(address, args)`.
// Events:
//    - 'close' : emitted when the connection is closing.
var Connection = exports.Connection = function() {
  EventEmitter.apply(this)
  this._subscriptions = []
  // An object to store all sorts of infos about the connection,
  // those will be persisted.
  this.infos = {}
}

_.extend(Connection.prototype, EventEmitter.prototype, {

  // Namespace for the connection. Allows to separate different types of connections.
  namespace: null,

  // Closes the connection and emit a `close` event.
  close: function() {
    var self = this
    connections.manager.close(this, function(err) {
      if (err) return self.emit('error', err)
      self.emit('close')
      self.removeAllListeners()
      connections.manager.send(coreMessages.connectionCloseAddress, [self.id || 9999])
    })
  },

  // Sends a message to the client
  send: function(address, args) {
    throw new Error('Implement me')
  },

  // Handler for common system message between all types of connections.
  onSysMessage: function(address, args) {
    var self = this
    // When a client wants to receive messages sent to an address,
    // we subscribe him and send acknowldgement.
    if (address === coreMessages.subscribeAddress) {
      var toAddress = args[0]
        , err = connections.manager.subscribe(this, toAddress)
      if (err) this.send(coreMessages.errorAddress, [err])
      else {
        this.send(coreMessages.subscribedAddress, [toAddress])

        // Add the new subscription to `_subscriptions` list and save this.
        var countBefore = this._subscriptions.length
        this._subscriptions.push(toAddress)
        this._subscriptions = _.uniq(this._subscriptions)
        if (countBefore < this._subscriptions.length)
          connections.manager.save(this, function(err) { if (err) self.emit('error', err) })
      }

    // Resends last messages received at the given address.
    } else if (address === coreMessages.resendAddress) {
      var fromAddress = args[0]
      this.send(fromAddress, connections.manager.resend(fromAddress))
    }

  },

  // Serializes the connection data to persist it to the database
  serialize: function() {
    return {
      subscriptions: this._subscriptions,
      infos: this.infos
    }
  },

  // Deserialize the persisted connection data
  deserialize: function(data) {
    var self = this
    this.infos = data.infos
    this._subscriptions = data.subscriptions
    this.once('open', function() {
      self._subscriptions.forEach(function(address) {
        var err = connections.manager.subscribe(self, address)
        if (err) self.emit('error', new Error('invalid subscription : ' + err))
      })
    })
  }
})


// Base class for all Servers.
// Subclasses must extend at least `start(done)` and `stop(done)`.
// Events:
//    - 'connection' : emitted when a new connection has been opened.
var Server = exports.Server = function(config) {
  EventEmitter.apply(this)
  this.connections = []
}

_.extend(Server.prototype, EventEmitter.prototype, {
  
  // Starts the server, and calls `done(err)` when done.
  // This is just a stub that subclasses must implement.
  start: function(done) {
    this.debug('starting')
  },

  // Stops the server, and calls `done(err)` when done.
  // This is just a stub that subclasses must implement.
  stop: function(done) {
    var self = this
    this.debug('stopping')
    this.connections.slice(0).forEach(function(connection) {
      connection.removeAllListeners()
      self._removeConnection(connection)
    })
    this.removeAllListeners()
  },

  // Opens `newConnection` and adds it to the server. 
  open: function(newConnection) {
    var self = this
    this.connections.push(newConnection)
    this.debug('new connection - now ' + this.connections.length)
    
    newConnection.on('close', function() {
      self._removeConnection(newConnection)
      self.debug('closed - now ' + self.connections.length)
    })

    connections.manager.open(newConnection, function(err) {
      if (err) return self.emit('error', err)
      self.emit('connection', newConnection)
      newConnection.emit('open')
      connections.manager.send(coreMessages.connectionOpenAddress, [newConnection.id || 9999])
    })
  },

  // Actually removes the `connection` from the list.
  _removeConnection: function(connection) {
    this.connections = _.without(this.connections, connection)
  }

})
