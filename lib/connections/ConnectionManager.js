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

var _ = require('underscore')
  , async = require('async')
  , debug = require('debug')('rhizome.server.connections')
  , expect = require('chai').expect
  , coreMessages = require('../core/messages')
  , coreUtils = require('../core/utils')
  , coreValidation = require('../core/validation')
  , persistence = require('./persistence')


var ConnectionManager = module.exports = function(config) {
  var self = this
  this._config = config

  // List of all the connections currently opened
  this._openConnections = []

  // This contains all the clients (OSC and websockets) which have subscribed to an address,
  // and therefore receive messages sent there.
  this._nsTree = coreUtils.createNsTree()

  // Most db operations are executed by batch
  this._eventQueue = []

  // Handle for the queue interval 
  this._storeWriteInt = null
}

_.extend(ConnectionManager.prototype, coreValidation.ValidateConfigMixin, {

  // Starts the connection manager, initializes the persistence layer, etc ...
  start: function(done) {
    var self = this
    async.series([
      this.validateConfig.bind(this),
      function(next) { self._config.store.start(next) },
      function(next) { self._config.store.managerRestore(next) }
    ], function(err, results) {
      if (err) return done(err)

      // Restore saved state of the ConnectionManager
      var restoredManagerState = results.pop()
      if (restoredManagerState !== null)
        self._nsTree.fromJSON(restoredManagerState.nsTree)

      // Interval that will handle store operations by batches
      self._storeWriteInt = setInterval(function() {
        // Events
        if (self._eventQueue.length) {
          var events = self._eventQueue
          self._eventQueue = []
          self._config.store.eventInsert(events, function(err) {
            if (err) console.error(err)
          })
        }
        // Manager state
        var managerState = { nsTree: self._nsTree.toJSON() }
        self._config.store.managerSave(managerState, function() {
          if (err) console.error(err)
        })
      }, self._config.storeWriteTime)

      done()
    })
  },

  // Removes all the subscribed connections.
  stop: function(done) {
    this._openConnections = []
    this._nsTree.get('/').forEach(function(ns) {
      ns.connections = []
      ns.lastMessage = null
    })
    clearInterval(this._storeWriteInt)
    this._storeWriteInt = null
    this._config.store.stop(done)
  },

  // Opens (and restore) a connection, takes care of persistence.
  open: function(connection, done) {
    var self = this
    if (_.contains(this._openConnections, connection))
      return done(new Error('connection ' + connection + ' is already open'))
    if (!connection.namespace)
      return done(new Error('connection should define a namespace'))
    if (connection.id === null && connection.autoId !== true)
      return done(new Error('connection should have an id'))
    if (connection.id && !_.isString(connection.id))
      return done(new Error('connection ' + connection + ' unvalid id : ' + connection.id))

    // Try to retrieve the persisted connection, otherwise save a new connection with that id.
    this._config.store.connectionInsertOrRestore(connection, function(err) {
      if (err) return done(err)
      self._openConnections.push(connection)
      self.send(coreMessages.connectionOpenAddress + '/' + connection.namespace, [connection.id])
      done()
      
      // Log in the event. This is not critical, so we just print an error
      // if something failed.
      if (self._config.collectStats) {
        self._eventQueue.push({
          timestamp: +(new Date),
          namespace: connection.namespace,
          id: connection.id,
          eventType: 'open'
        })
      }
    })
  },

  // Removes all subscriptions from `connection`.
  close: function(connection, done) {
    if (!_.contains(this._openConnections, connection))
      throw new Error('connection not open ' + connection)

    this._openConnections = _.without(this._openConnections, connection)
    this._nsTree.get('/').forEach(function(ns) {
      ns.connections = _.without(ns.connections, connection)
    })
    this.send(coreMessages.connectionCloseAddress + '/' + connection.namespace, [connection.id])
    done()

    // Log the 'close' event for the connection.
    if (this._config.collectStats) {
      this._eventQueue.push({
        timestamp: +(new Date),
        namespace: connection.namespace,
        id: connection.id,
        eventType: 'close'
      })
    }
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
      debug(connection.toString() + ' subscribed to ' + address)
    }
    return null
  },

  // Returns the last message sent at `address`.
  // If no message at this address, returns `null`.
  getLastMessage: function(address) {
    address = coreMessages.normalizeAddress(address)
    if (this._nsTree.has(address))
      return this._nsTree.get(address).lastMessage || []
    else return null
  },

  // Returns the list of connections id for `namespace`
  getOpenConnectionsIds: function(namespace) {
    return this._openConnections.filter(function(connection) { 
      return connection.namespace === namespace
    }).map(function(connection) { return connection.id })
  },

  // Updates a connection that has already been inserted in the store
  connectionUpdate: function(connection, done) {
    this._config.store.connectionUpdate(connection, done)
  },

  // TODO : get rid of this 
  // List ids of connections from `namespace` that have been persisted in db.
  listPersisted: function(namespace, done) {
    this._config.store.connectionIdList(namespace, done)
  },

  configDefaults: {
    store: new persistence.NoStore(),
    collectStats: false,
    storeWriteTime: 30000
  },

  configValidator: new coreValidation.ChaiValidator({
    // If `store` is a string, we take it as a path and use NEDBStore
    store: function(val, done) {
      var self = this
      if (_.isString(val)) {
        coreUtils.validateDirExists(val, function(err) {
          if (err) return done(err)
          self.store = new persistence.NEDBStore(val)
          done()
        })
      } else {
        expect(val).to.be.an('object')
        done()
      }
    },
    collectStats: function(val) {
      expect(val).to.be.a('boolean')
    },
    storeWriteTime: function(val) {
      expect(val).to.be.a('number')
    }
  }),

  _getNamespace: function(connection) {
    // Make sure that connection class has been registered,
    // and get the namespace
    var result = _.chain(ConnectionManager._connectionClasses).pairs().find(function(p) {
      return connection instanceof p[1]
    }).value()
    if (!result) return null
    else return result[0]
  }

})