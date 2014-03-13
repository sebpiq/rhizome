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
  , connections = require('./connections')
  , shared = require('../shared')


var Connection = module.exports = function() {
  EventEmitter.apply(this)
}

_.extend(Connection.prototype, EventEmitter.prototype, {

  // Sends a message to the client
  send: function(address, args) {
    throw new Error('Implement me')
  },

  // Handler for when a system message has been received
  onSysMessage: function(address, args) {
    // When a client wants to receive messages sent to an address,
    // we subscribe him and send acknowldgement.
    if (address === shared.subscribeAddress) {
      var toAddress = args[0]
      connections.subscribe(toAddress, this)
      this.send(shared.subscribedAddress, [toAddress])

    // Resends last messages received at the given address.
    } else if (address === shared.resendAddress) {
      var fromAddress = args[0]
      this.send(fromAddress, connections.getLastMessage(fromAddress))
    }

  }
})