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
  , async = require('async')
  , _ = require('underscore')
  , nedb = require('nedb')
  , redis = require('redis')
  , errors = require('../core/errors')
  , utils = require('../core/utils')

// Store that does not store the data
var NoStore = exports.NoStore = function() {}
_.extend(NoStore.prototype, {
  // Starts the persistence store
  start: function(done) {done()},
  // Stops the persistence store
  stop: function(done) {done()},
  // Saves the connection and calls `done(err)`. 
  // If the connection doesn't have an id, assigns one automatically if autoId is true, 
  //  otherwise return error.
  // If the connection did have an id and exists, it is restored.
  // If the connection did have an id, and it doesn't exist :
  //    - if autoId is true, a new id is assigned and connection is inserted
  //    - if autoId is false, the connection is inserted
  connectionInsertOrRestore: function(connection, done) {
    if (connection.id === null)
      connection.id = Math.random().toString().slice(2)
    done()
  },
  // Updates an already existing connection, 
  connectionUpdate: function(connection, done) {done()},
  // Fetches all the connections ids in `namespace` and calls `done(err, ids)`.
  connectionIdList: function(namespace, done) {done(null, [])},
  // Restores the persisted state of the manager, and calls `done(err, state)`.
  // `state` is `null` if it was not previously saved.
  managerRestore: function(done) {done(null, null)},
  // Saves the manager `state` and calls `done(err)`.
  managerSave: function(state, done) {done(null)}
})


// Creates a nedb persistance store. `dbDir` is the absolute path
// of the folder where the db files will be stored.
// !!! This does not support concurrent read/write from several node processes.
var NEDBStore = exports.NEDBStore = function(dbDir) {
  this._connectionsCollection = null
  this._dbDir = dbDir
  this._collectionFile = path.join(dbDir, 'connections.db')
  this._eventsFile = path.join(dbDir, 'events.db')
  this._managerFile = path.join(dbDir, 'manager.json')
}

_.extend(NEDBStore.prototype, {

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

  connectionUpdate: function(connection, done) {
    this._connectionsCollection.update(
      { connectionId: connection.id, namespace: connection.namespace },
      { '$set': { data: connection.serialize() } }
    , done)
  },

  connectionInsertOrRestore: function(connection, done) {
    var namespace = connection.namespace
      , connectionId = connection.id

    var _onQueryDone = (err, doc) => {
      if (err) return done(err)

      // If the connection already exists, we restore it
      if (doc !== null) {
        connection.deserialize(doc.data)
        done()

      // Otherwise, we insert it
      } else {
        if (connection.autoId === true)
          connectionId = null
        else if (!connectionId) 
          return done(new Error('if autoId is false, connection.id must be set'))

        var doc = {
          connectionId: connectionId,
          namespace: namespace,
          data: connection.serialize()
        }

        var asyncOps = [ this._connectionsCollection.insert.bind(this._connectionsCollection, doc) ]

        // If connectionId is null, we use the automatically generated _id
        if (connectionId === null) {
          asyncOps.push((doc, next) => {
            connectionId = connection.id = doc._id.toString()
            this._connectionsCollection.update(
              { _id: doc._id },
              { '$set': { connectionId: connectionId } }
            , next)
          })
        }

        async.waterfall(asyncOps, done)
      }
    }

    if (connectionId !== null)
      this._connectionsCollection.findOne({ connectionId: connectionId, namespace: namespace }, _onQueryDone)
    else _onQueryDone(null, null)
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
  }

})


// TODO : bubble-up errors
var RedisStore = exports.RedisStore = function() {
  this._redisClient = null
}

_.extend(RedisStore.prototype, {

  start: function(done) {
    this._redisClient = this._createClient()
    this._redisClient.once('ready', () => done())
    this._redisClient.on('reconnecting', () => console.log(this, 'reconnecting ...'))
    this._redisClient.on('error', (err) => console.error(err)) 
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

  connectionInsertOrRestore: function(connection, done) {
    var namespace = connection.namespace
      , connectionId = connection.id
      , asyncOps = []
      , redisKey = null
      , hadId

    // Rejects connections with no id, and autoId is false
    if (connectionId === null && connection.autoId === false)
      return done(new Error('if autoId is false, connection.id must be set'))

    var _generateNewId = (next) => {
      async.whilst(
        () => !redisKey,
        (nextKey) => {
          connectionId = utils.getRandomString(8)
          redisKey = this._makeKey(namespace, connectionId)
          this._redisClient.set(redisKey, '', 'nx', (err, reply) => {
            if (reply === null) 
              redisKey = null
            else 
              connection.id = connectionId
            nextKey()
          })
        },
        next
      )
    }

    // If `connectionId` is null (autoId is true), generate a new unique id
    if (connectionId === null) {
      hadId = false
      asyncOps.push(_generateNewId)
    } else hadId = true

    // We get the connection, so we need to know whether restoring of inserting
    asyncOps.push((next) => {
      redisKey = this._makeKey(namespace, connectionId)
      this._redisClient.get(redisKey, next)
    })

    asyncOps.push((value, next) => {
      // Connection exists, we restore it
      if (value && value.length) {
        connection.deserialize(this._parseValue(value))
        next()

      // Connection doesn't exist, and its autoId is set to true, we force a new id.
      } else if (hadId === true && connection.autoId === true) {

        redisKey = null
        async.series([
          _generateNewId,
          (next) => {
            this._redisClient.set(redisKey, this._stringifyValue(connection.serialize()), next)
          }
        ], next)
        // ??? } else next(new Error('could not restore connection and autoId is False'))
        
      // Simply insert the connection
      } else this._redisClient.set(redisKey, this._stringifyValue(connection.serialize()), next)
    })

    async.waterfall(asyncOps, (err) => done(err))
  },

  connectionUpdate: function(connection, done) {
    var redisKey = this._makeKey(connection.namespace, connection.id)
      , value = this._stringifyValue(connection.serialize())
    this._redisClient.set(redisKey, value, done)
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

  _createClient: function() {
    return redis.createClient()
  },

  _makeKey: function(namespace, id) {
    return 'connections:' + namespace + ':' + id
  },

  _parseValue: function(value) {
    return JSON.parse(value)
  },

  _stringifyValue: function(value) {
    return JSON.stringify(value)
  }

})