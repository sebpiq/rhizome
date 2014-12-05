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
  , async = require('async')
  , debug = require('debug')('rhizome.server.connections')
  , expect = require('chai').expect
  , coreMessages = require('../core/messages')
  , coreUtils = require('../core/utils')
  , persistence = require('./persistence')

// Map {`namespace`: `ConnectionClass`}
var connectionClasses = {}

var ConnectionManager = module.exports = function(config) {
  this._config = config

  // List of all the connections currently opened
  this._openConnections = []

  // This contains all the clients (OSC and websockets) which have subscribed to an address,
  // and therefore receive messages sent there.
  this._nsTree = coreUtils.createNsTree()
} 

_.extend(ConnectionManager.prototype, coreUtils.ValidateConfigMixin, {

  // Starts the connection manager, initializes the persistence layer, etc ...
  start: function(done) {
    var self = this
    this._validateConfig(function(err) {
      if (err) return done(err)
      self._config.store.start(done)
    })
  },

  // Removes all the subscribed connections.
  stop: function(done) {
    this._openConnections = []
    this._nsTree.get('/').forEach(function(ns) {
      ns.connections = []
      ns.lastMessage = null
    })
    this._config.store.stop(done)
  },

  // Registers a connection class
  registerClass: function(namespace, connectionClass) {
    connectionClasses[namespace] = connectionClass
  },

  // Opens (and restore) a connection, takes care of persistence.
  open: function(connection, done) {
    var self = this
      , namespace = this._getNamespace(connection)

    if (namespace === null)
      return done(new Error('connection class for ' + connection + ' has not been registered'))
    if (_.contains(this._openConnections, connection))
      return done(new Error('connection ' + connection + ' is already open'))

    // Executed in the end, if all the previous succeeded
    var _doFinally = function(err) {
      if (err) return done(err)
      self._openConnections.push(connection)
      done()
      // Log in the event. This is not critical, so we just print an error
      // if something failed.
      self._config.store.eventInsert({
        when: +(new Date),
        who: [namespace, connection.id],
        what: 'open'
      }, function(err) { if (err) console.log(err) })
    }

    // Assign unique id and save the connection
    if (connection.id === undefined) {
      async.whilst(
        function() { return !connection.id },
        function(next) {
          var id = coreUtils.getRandomString()
          // Ensures unicity of the connection id
          self._config.store.connectionExists(namespace, id, function(err, exists) {
            if (err) return next(err)
            if (exists) next()
            else {
              connection.id = id
              next()
            }
          })
        },
        function(err) {
          if (err) return done(err)
          self._config.store.connectionSave(namespace, connection, _doFinally)
        }
      )
    
    // It already has an id, so try to retrieve the persisted connection,
    // otherwise, save a new connection with that id.
    } else {
      if (!_.isString(connection.id))
        return done(new Error('connection ' + connection + ' unvalid id : ' + connection.id))

      this._config.store.connectionExists(namespace, connection.id, function(err, exists) {
        if (err) return done(err)
        if (exists)
          self._config.store.connectionRestore(namespace, connection, _doFinally)
        else self._config.store.connectionSave(namespace, connection, _doFinally)
      })
    }
  },

  // Removes all subscriptions from `connection`.
  close: function(connection, done) {
    var namespace = this._getNamespace(connection)
    if (!_.contains(this._openConnections, connection))
      throw new Error('connection not open ' + connection)

    this._openConnections = _.without(this._openConnections, connection)
    this._nsTree.get('/').forEach(function(ns) {
      ns.connections = _.without(ns.connections, connection)
    })
    done()

    // Log the 'close' event for the connection.
    this._config.store.eventInsert({
      when: +(new Date),
      who: [namespace, connection.id],
      what: 'close'
    }, function(err) { if (err) console.log(err) })
  },

  // Sends a message to `address` with arguments `args`. Only connections subscribed to `address` will receive it.
  send: function(address, args) {
    address = coreMessages.normalizeAddress(address)
    var argsErr = coreMessages.validateArgs(args)
    if (argsErr) throw new Error(argsErr)

    // Send the message to all connections subscribed to a parent namespace
    debug('send ' + address + ' ' + coreMessages.argsToString(args))
    var ns = this._nsTree.get(address, function(ns) {
      ns.connections.forEach(function(connection) {
        connection.send(address, args)
      })
    })
    ns.lastMessage = args
    return null
  },

  // Subscribes `connection` to all messages sent to `address`.
  // Returns `null` if all went well, an error message otherwise
  subscribe: function(connection, address) {
    if (!_.contains(this._openConnections, connection))
      throw new Error('connection not open ' + connection)

    var addrErr = coreMessages.validateAddressForSub(address)
    if (addrErr !== null) return addrErr

    var addrConnections = this._nsTree.get(address).connections
    if (addrConnections.indexOf(connection) === -1) {
      addrConnections.push(connection)
      debug('subscribe ' + connection.toString() + ' to ' + address)
    }
    return null
  },

  // Returns the last message sent at `address`.
  resend: function(address) {
    address = coreMessages.normalizeAddress(address)
    debug('resend ' + address)
    if (this._nsTree.has(address))
      return this._nsTree.get(address).lastMessage || []
    else return [] 
  },

  // Save a connection to the store
  save: function(connection, done) {
    var namespace = this._getNamespace(connection)
    if (namespace === null)
      return done(new Error('connection class for ' + connection + ' has not been registered'))
    this._config.store.connectionSave(namespace, connection, done)
  },

  configDefaults: {
    store: new persistence.NEDBStore('db'),
    collectStats: false
  },

  configValidator: new coreUtils.ChaiValidator({
    store: function(val) {
      expect(val).to.be.an.instanceof(persistence.BaseStore)
    },
    collectStats: function(val) {
      expect(val).to.be.a('boolean')
    }
  }),

  _getNamespace: function(connection) {
    // Make sure that connection class has been registered,
    // and get the namespace
    var result = _.chain(connectionClasses).pairs().find(function(p) {
      return connection instanceof p[1]
    }).value()
    if (!result) return null
    else return result[0]
  }

})