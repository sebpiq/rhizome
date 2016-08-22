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

var path = require('path')
  , fs = require('fs')
  , EventEmitter = require('events').EventEmitter
  , async = require('async')
  , _ = require('underscore')
  , nedb = require('nedb')
  , redis = require('redis')
  , errors = require('../core/errors')
  , utils = require('../core/utils')


// Store that does not store the data
var BaseStore = exports.BaseStore = function() { EventEmitter.apply(this) }
_.extend(BaseStore.prototype, EventEmitter.prototype, {

  // --------------- Methods to implement

  // Starts the persistence store
  start: function(done) { throw Error('implement me') },

  // Stops the persistence store
  stop: function(done) { throw Error('implement me') },

  // Fetches all the connections ids in `namespace` and calls `done(err, ids)`.
  connectionIdList: function(namespace, done) { throw Error('implement me') },

  // Restores the persisted state of the manager, and calls `done(err, state)`.
  // `state` is `null` if it was not previously saved.
  managerRestore: function(done) { throw Error('implement me') },
  
  // Saves the manager `state` and calls `done(err)`.
  managerSave: function(state, done) { throw Error('implement me') },

  // Assigns a unique id to the connection and calls `done` 
  _connectionAssignUniqueId: function(connection, done) { throw Error('implement me') },

  // Returns the data as used by connection.serialize() / deserialize() or `null`
  _connectionGet: function(connection, done) { throw Error('implement me') },
  _connectionInsert: function(connection, done) { throw Error('implement me') },
  _connectionUpdate: function(connection, done) { throw Error('implement me') },


  // --------------- Other public methods

  // Inserts or restores the connection and calls `done(err)`
  connectionInsertOrRestore: function(connection, done) {

    if (connection.id === null) {

      // If connection id is null (autoId is true), generate a new unique id
      if (connection.autoId === true) {
        async.series([
          this._connectionAssignUniqueId.bind(this, connection),
          this._connectionInsert.bind(this, connection)
        ], done)
      }

      // Rejects connections with no id, if autoId is false
      else 
        return done(new Error('if autoId is false, connection.id must be set'))

    // If connection already has an id assigned, we don't know whether it is new
    // and we need to insert it, or whether it should be restored 
    } else {      
      this._connectionGet(connection, (err, data) => {

        // Connection exists, so we just restore it
        if (data) {
          connection.deserialize(data)
          return done(null, connection)
  
        // Connection doesn't exist, and its autoId is set to true, we force a new id
        // so we ignore the original connection id. 
        } else if (connection.autoId === true) {
          async.series([
            this._connectionAssignUniqueId.bind(this, connection),
            this._connectionInsert.bind(this, connection)
          ], done)
          // ??? } else next(new Error('could not restore connection and autoId is False'))
          
        // Connection doesn't exist and it has an id already assigned, 
        // so we simply insert it.
        } else this._connectionInsert(connection, done)

      })

    }
  },

  // Updates an already existing connection, 
  connectionUpdate: function(connection, done) { this._connectionUpdate(connection, done) }
})


// Store that does not store the data
var NoStore = exports.NoStore = function() { BaseStore.apply(this, arguments) }
_.extend(NoStore.prototype, BaseStore.prototype, {
  start: function(done) { done() },
  stop: function(done) { done() },
  connectionIdList: function(namespace, done) { done(null, []) },
  managerRestore: function(done) { done(null, null) },
  managerSave: function(state, done) { done() },
  _connectionAssignUniqueId: function(connection, done) {
    connection.id = Math.random().toString().slice(2)
    done()
  },
  _connectionGet: function(connection, done) { done(null, null) },
  _connectionInsert: function(connection, done) { done() },
  _connectionUpdate: function(connection, done) { done() }
})


// Creates a nedb persistance store. `dbDir` is the absolute path
// of the folder where the db files will be stored.
// !!! This does not support concurrent read/write from several node processes.
var NEDBStore = exports.NEDBStore = function(dbDir) {
  BaseStore.apply(this)
  this._connectionsCollection = null
  this._dbDir = dbDir
  this._collectionFile = path.join(dbDir, 'connections.db')
  this._managerFile = path.join(dbDir, 'manager.json')
}

_.extend(NEDBStore.prototype, BaseStore.prototype, {

  start: function(done) {
    this._connectionsCollection = new nedb({ filename: this._collectionFile })
    async.series([
      this._connectionsCollection.loadDatabase.bind(this._connectionsCollection)
    ], done)
  },

  stop: function(done) {
    this._connectionsCollection = null
    done()
  },

  connectionIdList: function(namespace, done) {
    this._connectionsCollection.find({ namespace: namespace }, (err, docs) => {
      if (err) return done(err)
      done(null, docs.map((doc) => doc.connectionId))
    })
  },

  managerSave: function(state, done) {
    // Remove Buffers from `state` as we cannot serialize them to JSON.
    state.nsTree = state.nsTree.map((nodeData) => {
      if (nodeData.lastMessage)
        nodeData.lastMessage = nodeData.lastMessage.map((arg) => (arg instanceof Buffer) ? null : arg)
      return nodeData
    })
    fs.writeFile(this._managerFile, JSON.stringify(state), done)
  },

  managerRestore: function(done) {
    fs.readFile(this._managerFile, (err, state) => {
      if (err) {
        if (err.code === 'ENOENT') done(null, null)
        else done(err)
      } else {
        state = JSON.parse(state)
        _.defaults(state, { nsTree: [] })
        state.nsTree = state.nsTree.map((nodeData) => {
          if (nodeData.lastMessage)
            nodeData.lastMessage = nodeData.lastMessage.map((arg) => (arg === null) ? new Buffer('') : arg)
          return nodeData
        })
        done(null, state)
      }
    })
  },

  _connectionAssignUniqueId: function(connection, done) {
    this._connectionsCollection.insert({}, (err, doc) => {
      if (err) return done(err)
      connection.id = doc._id
      done(null)
    })
  },
  
  _connectionGet: function(connection, done) {
    this._connectionsCollection.findOne({
      connectionId: connection.id, 
      namespace: connection.namespace 
    }, (err, doc) => {
      if (err) done(err)
      else if (doc) done(null, doc.data)
      else done(null, null) 
    })
  },
  
  _connectionInsert: function(connection, done) {
    var doc = {
      connectionId: connection.id,
      namespace: connection.namespace,
      data: connection.serialize()
    }
    this._connectionsCollection.insert(doc, done)
  },
  
  _connectionUpdate: function(connection, done) {
    this._connectionsCollection.update(
      { connectionId: connection.id, namespace: connection.namespace },
      { '$set': { data: connection.serialize() } 
    }, done)
  }

})


// Creates a redis persistence store.
var RedisStore = exports.RedisStore = function() {
  BaseStore.apply(this)
  this._redisClient = null
}

_.extend(RedisStore.prototype, NoStore.prototype, {

  // --------------- Implemented methods
  start: function(done) {
    this._redisClient = this._createClient()
    this._redisClient.once('ready', () => done())
    this._redisClient.on('reconnecting', () => console.log(this, 'reconnecting ...'))
    this._redisClient.on('error', (err) => this.emit('error', err))
  },

  stop: function(done) {
    this._redisClient.once('end', () => {
      this._redisClient.removeAllListeners()
      this._redisClient.on('error', () => {})
      this._redisClient = null
      done()
    })
    this._redisClient.quit()
  },

  connectionIdList: function(namespace, done) {
    var keyBase = 'connections:' + namespace + ':'
    this._redisClient.keys(keyBase + '*', (err, keys) => {
      if (err) return done(err)
      done(null, keys.map((key) => key.replace(keyBase, '')))
    })
  },

  managerRestore: function(done) {
    this._redisClient.get('manager', (err, value) => {
      if (err) return done(err)
      if (!value) return done(null, null)
      else {
        var state = this._parseValue(value)
        _.defaults(state, { nsTree: [] })
        state.nsTree = state.nsTree.map((nodeData) => {
          if (nodeData.lastMessage)
            nodeData.lastMessage = nodeData.lastMessage.map((arg) => (arg === null) ? new Buffer('') : arg)
          return nodeData
        })
        done(null, state)
      }
    })
  },

  managerSave: function(state, done) {
    state.nsTree = state.nsTree.map((nodeData) => {
      if (nodeData.lastMessage)
        nodeData.lastMessage = nodeData.lastMessage.map((arg) => (arg instanceof Buffer) ? null : arg)
      return nodeData
    })
    this._redisClient.set('manager', this._stringifyValue(state), (err) => done(err))
  },

  _connectionAssignUniqueId: function(connection, done) {
    connection.id = null
    async.whilst(
      () => !connection.id,
      (nextKey) => {
        var redisKey
        connection.id = utils.getRandomString(8)
        redisKey = this._makeKey(connection)
        // Try to set the key `redisKey`, because we use option 'nx,
        // setting will fail and `null` be returned if the key already exists.
        this._redisClient.set(redisKey, '', 'nx', (err, reply) => {
          if (err) return done(err) 
          else if (reply === null) 
            connection.id = null
          nextKey()
        })
      },
      done
    )
  },

  _connectionGet: function(connection, done) {
    var redisKey = this._makeKey(connection)
    this._redisClient.get(redisKey, (err, value) => {
      if (err) return done(err)
      else if (value && value.length) done(null, this._parseValue(value))
      // If `value` exists, but is an empty string, we consider the entry doesn't exist
      else done(null, null)
    })
  },

  _connectionInsert: function(connection, done) {
    var redisKey = this._makeKey(connection)
    this._redisClient.set(redisKey, this._stringifyValue(connection.serialize()), done)
  },
  _connectionUpdate: function(connection, done) { this._connectionInsert(connection, done) },

  // --------------- Other helpers
  _createClient: function() {
    return redis.createClient()
  },

  _makeKey: function(connection) {
    return 'connections:' + connection.namespace + ':' + connection.id
  },

  _parseValue: function(value) {
    return JSON.parse(value)
  },

  _stringifyValue: function(value) {
    return JSON.stringify(value)
  }

})