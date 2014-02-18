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
  , shared = require('../shared')

// This contains all the clients (OSC and websockets) which have subscribed to an address,
// and therefore receive messages sent there.
// Connections have the following interface :
var nsTree = exports._nsTree = shared.createNsTree({
  createData: function() {
    return { connections: [] }
  }
})

exports.send = function(address, args) {
  address = shared.normalizeAddress(address)
  nsTree.get(address, function(ns) {
    ns.data.connections.forEach(function(connection) { connection.send(address, args) })
  })
}

exports.subscribe = function(address, connection) {
  var addrConnections = nsTree.get(address).data.connections
  if (addrConnections.indexOf(connection) === -1) addrConnections.push(connection)
}

exports.removeAll = function() {
  nsTree.get('/').forEach(function(ns) { ns.data.connections = [] })
}

exports.remove = function(connection) {
  nsTree.get('/').forEach(function(ns) {
    ns.data.connections = _.without(ns.data.connections, connection)
  })
}

