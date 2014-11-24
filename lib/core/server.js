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


// Base class for different types of connections.
// Subclasses must implement at least `send(address, args)`.
var Connection = exports.Connection = function() {
  EventEmitter.apply(this)
}

_.extend(Connection.prototype, EventEmitter.prototype, {

  // Closes the connection and emit a `close` event.
  close: function() {
    connections.send(coreMessages.connectionCloseAddress, [this.userId || 0])
    this.emit('close')
    this.removeAllListeners()
  },

  // Sends a message to the client
  send: function(address, args) {
    throw new Error('Implement me')
  },

  // Handler for common system message between all types of connections.
  onSysMessage: function(address, args) {
    // When a client wants to receive messages sent to an address,
    // we subscribe him and send acknowldgement.
    if (address === coreMessages.subscribeAddress) {
      var toAddress = args[0]
        , err = connections.subscribe(this, toAddress)
      if (err) this.send(coreMessages.errorAddress, [err])
      else this.send(coreMessages.subscribedAddress, [toAddress])

    // Resends last messages received at the given address.
    } else if (address === coreMessages.resendAddress) {
      var fromAddress = args[0]
      this.send(fromAddress, connections.resend(fromAddress))
    }

  }
})


// Base class for all Servers.
// Subclasses must extend at least `start(config, done)` and `stop(done)`.
var Server = exports.Server = function() {
  EventEmitter.apply(this)
  this.connections = []
}

_.extend(Server.prototype, EventEmitter.prototype, {
  
  // Starts the server, and calls `done(err)` when done.
  // This is just a stub that subclasses must implement.
  start: function(config, done) {
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
    this.emit('connection', newConnection)
    connections.send(coreMessages.connectionOpenAddress, [newConnection.userId || 0])
    return newConnection
  },

  // Actually removes the `connection` from the list.
  _removeConnection: function(connection) {
    var i = this.connections.indexOf(connection)
    if (i !== -1) {
      this.connections.splice(i, 1)
      connections.remove(connection)
    }
    return connection
  }

})