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
  , _ = require('underscore')
  , async = require('async')
  , connections = require('../connections')
  , coreMessages = require('./messages')
  , coreUtils = require('./utils')


// Base class for all Servers.
// Subclasses must extend at least `start(done)` and `stop(done)`.
// Events:
//    - 'connection' : emitted when a new connection has been opened.
var Server = exports.Server = function(config) {
  EventEmitter.apply(this)
  this.connections = []
}

_.extend(Server.prototype, EventEmitter.prototype, {
  
  // Class used to represent server connections
  ConnectionClass: null,

  // Overwrite with `debug` function from node-debug
  debug: function() {},

  // Starts the server, and calls `done(err)` when done.
  // This is just a stub that subclasses must complement.
  start: function(done) {
    this.debug('starting')
  },

  // Stops the server, and calls `done(err)` when done.
  // This is just a stub that subclasses must complement.
  // !!! Subclasses implementing their own `stop` must call this last, 
  // because it unbinds event handlers, including error handlers. 
  stop: function(done) {
    this.debug('stopping')
    async.each(this.connections.slice(0), (connection, next) => {
      connection.once('close', () => {
        this.connections = _.without(this.connections, connection)
        next()
      })
      connection.close()
    }, done)
  },

  // Creates and opens a new connection with arguments `args`, then calls `done(err, connection)`
  openConnection: function(args, done) {
    var connection = new this.ConnectionClass(args)
      , queuedSysMessages = []
      , onSysMessage
    this.connections.push(connection)

    // Replace `onSysMessage` handler with a method that will just queue received messages.
    // We will then send these queued messages to the actual `onSysMessage` handler,
    // after connection is opened.
    onSysMessage = connection.onSysMessage
    connection.onSysMessage = function() { queuedSysMessages.push(arguments) }

    connection.on('error', (err) => this.emit('error', err))

    connection.on('close', () => {
      this.connections = _.without(this.connections, connection)
      this.debug(connection.toString() + ' closed - total connections ' + this.connections.length)
    })

    connections.manager.open(connection, (err) => {
      if (err) return done(err)
      connection.status = 'open'
      this.debug(connection.toString() + ' opened - total connections ' + this.connections.length)
    
      // Restore `onSysMessages` method and execute queued messages
      connection.onSysMessage = onSysMessage
      queuedSysMessages.forEach((args) => connection.onSysMessage.apply(connection, args))
      
      // Restore subscriptions
      connection._subscriptions.forEach((address) => {
        var err = connections.manager.subscribe(connection, address)
        if (err) this.emit('error', new Error('invalid subscription : ' + err))
      })

      done(null, connection)
      this.emit('connection', connection)
    })
  }

})


// Base class for different types of connections.
// Subclasses must implement at least `send(address, args)`.
// Events:
//    - 'close' : emitted when the connection is closing.
var Connection = exports.Connection = function(args) {
  EventEmitter.apply(this)

  this._subscriptions = []
  this.status = 'closed'
  this.id = null

  // An object to store all sorts of infos about the connection,
  // those will be persisted.
  this.infos = {}
}

_.extend(Connection.prototype, EventEmitter.prototype, {

  // Namespace for the connection. Allows to separate different types of connections.
  namespace: null,

  // If true, an id will automatically be assigned when calling `connection.open`,
  // if the connection doesn't already have an id.
  autoId: false,

  // Closes the connection and emit a `close` event.
  close: function() {
    connections.manager.close(this, (err) => {
      if (err) return this.emit('error', err)
      this.status = 'closed'
      this.emit('close')
      this.removeAllListeners()
    })
  },

  // Sends a message to the connection (in most cases, to the remotely connected client)
  send: function(address, args) {
    throw new Error('Implement me')
  },

  // Handler for common system message between all types of connections.
  onSysMessage: function(address, args) {
    // When a client wants to receive messages sent to an address,
    // we subscribe him and send acknowldgement.
    if (address === coreMessages.subscribeAddress) {
      var toAddress = args[0]
        , err = connections.manager.subscribe(this, toAddress)
      if (err) this.send(coreMessages.errorAddress, [err])
      else {
        this.send(coreMessages.subscribedAddress, [toAddress])

        // Add the new subscription to `_subscriptions` list and save changes.
        var countBefore = this._subscriptions.length
        this._subscriptions.push(toAddress)
        this._subscriptions = _.uniq(this._subscriptions)
        if (countBefore < this._subscriptions.length) {
          connections.manager.connectionUpdate(this, (err) => {
            if (err) this.emit('error', err)
          })
        }
      }

    // Resends last messages received at the given address.
    } else if (address === coreMessages.resendAddress) {
      var fromAddress = args[0]
        , resentArgs = connections.manager.getLastMessage(fromAddress)
      if (resentArgs !== null)
        this.send(fromAddress, resentArgs)

    // Sends a list of the ids of the open connections for the given namespace
    } else if (address === coreMessages.connectionsSendListAddress) {
      var namespace = args[0]
        , idList = connections.manager.getOpenConnectionsIds(namespace)
      this.send(coreMessages.connectionsTakeListAddress + '/' + namespace, idList)
    } 
  },

  // Persist connection
  save: function() {
    connections.manager.connectionUpdate(this, (err) => {
      err && this.emit('error', new Error('error updating connection : ' + err.message))
    })
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
    this.infos = data.infos
    this._subscriptions = data.subscriptions
  },

  toString: function() { return 'Connection(' + this.namespace + ':' + this.id + ')' }
})