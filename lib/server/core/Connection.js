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


// Base class for different types of connections.
// Subclasses must implement at least `send(address, args)`.
var Connection = module.exports = function() {
  EventEmitter.apply(this)
}

_.extend(Connection.prototype, EventEmitter.prototype, {

  // Closes the connection and emit a `close` event.
  close: function() {
    connections.send(shared.connectionCloseAddress, [this.userId || 0])
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
    if (address === shared.subscribeAddress) {
      var toAddress = args[0]
        , err = connections.subscribe(this, toAddress)
      if (err) this.send(shared.errorAddress, [err])
      else this.send(shared.subscribedAddress, [toAddress])

    // Resends last messages received at the given address.
    } else if (address === shared.resendAddress) {
      var fromAddress = args[0]
      this.send(fromAddress, connections.resend(fromAddress))
    }

  }
})