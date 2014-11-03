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

var Server = module.exports = function() {
  EventEmitter.apply(this)
  this.connections = []
}

_.extend(Server.prototype, EventEmitter.prototype, {
  
  start: function(config, done) {
    this.debug('starting')
  },

  stop: function(done) {
    var self = this
    this.debug('stopping')
    this.connections.slice(0).forEach(function(connection) {
      connection.removeAllListeners()
      self._removeConnection(connection)
    })
  },

  addConnection: function(connection) {
    connection.onOpened()
    return connection
  },

  removeConnection: function(connection) {
    connection.onClosed()
    return connection
  },

  _addConnection: function(connection) {
    this.connections.push(connection)
    connection.on('closed', this.onConnectionClosed.bind(this, connection))
    return connection
  },

  _removeConnection: function(connection) {
    var i = this.connections.indexOf(connection)
    if (i !== -1) {
      this.connections.splice(i, 1)
      connections.remove(connection)
    }
    return connection
  },

  onConnectionClosed: function(connection) {
    this._removeConnection(connection)
  }

})
