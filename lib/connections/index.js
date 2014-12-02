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
  , debug = require('debug')('rhizome.server.connections')
  , coreMessages = require('../core/messages')
  , coreUtils = require('../core/utils')

// List of all the connections currently opened
var allConnections = []

// This contains all the clients (OSC and websockets) which have subscribed to an address,
// and therefore receive messages sent there.
var nsTree = exports._nsTree = coreUtils.createNsTree()

// Registers a connection once it was opened.
// TODO: check for id unicity
exports.open = function(connection, done) {
  allConnections.push(connection)

  // Assign new id
  if (connection.id === undefined) {
    connection.id = coreUtils.getRandomString()
    done()
  
  } else if (!_.isString(connection.id))
    done(new Error('connection has no id ' + connection))

  // It already has an id, so try to retrieve the persisted connection
  else {
    //persisted.connections.get(connection.id)
  }
}

// Removes all subscriptions from `connection`.
exports.close = function(connection, done) {
  allConnections = _.without(allConnections, connection)
  nsTree.get('/').forEach(function(ns) {
    ns.connections = _.without(ns.connections, connection)
  })
  done()
}

// Sends a message to `address` with arguments `args`. Only connections subscribed to `address` will receive it.
exports.send = function(address, args) {
  address = coreMessages.normalizeAddress(address)
  var argsErr = coreMessages.validateArgs(args)
  if (argsErr) throw new Error(argsErr)

  // Send the message to all connections subscribed to a parent namespace
  debug('send ' + address + ' ' + coreMessages.argsToString(args))
  var ns = nsTree.get(address, function(ns) {
    ns.connections.forEach(function(connection) {
      connection.send(address, args)
    })
  })
  ns.lastMessage = args
  return null
}

// Subscribes `connection` to all messages sent to `address`.
// Returns `null` if all went well, an error message otherwise
exports.subscribe = function(connection, address) {
  if (!_.contains(allConnections, connection))
    throw new Error('unknown connection ' + connection)
  var addrErr = coreMessages.validateAddressForSub(address)
  if (addrErr !== null) return addrErr
  var addrConnections = nsTree.get(address).connections
  if (addrConnections.indexOf(connection) === -1) {
    addrConnections.push(connection)
    debug('subscribe ' + connection.toString() + ' to ' + address)
  }
  return null
}

// Returns the last message sent at `address`.
exports.resend = function(address) {
  address = coreMessages.normalizeAddress(address)
  debug('resend ' + address)
  if (nsTree.has(address))
    return nsTree.get(address).lastMessage || []
  else return [] 
}

// Removes all the subscribed connections.
exports._clean = function() {
  allConnections = []
  nsTree.get('/').forEach(function(ns) {
    ns.connections = []
    ns.lastMessage = null
  })
}