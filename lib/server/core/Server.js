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
  , shared = require('../../shared')

// Base class for all Servers.
// Subclasses must implement at least `start(config, done)` and `stop(done)`.
var Server = module.exports = function() {
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
    connections.send(shared.connectionOpenAddress, [newConnection.userId || 0])
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
