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
  , errors = require('../core/errors')

// Store that does not store the data
var NoStore = exports.NoStore = function() {}
_.extend(NoStore.prototype, {
  // Starts the persistence store
  start: function(done) {done()},
  // Stops the persistence store
  stop: function(done) {done()},
  // Saves the connection and calls `done(err)`. 
  // If the connection doesn't have an id, assigns one automatically.
  // If the connection did have an id and exists, it is restored.
  // If the connection did have an id, and it doesn't exist :
  //    - if autoId is true, a new id is assigned and connection is inserted
  //    - if autoId is false, the connection is inserted
  connectionInsertOrRestore: function(connection, done) {
    if (connection.id === null)
      connection.id = Math.random().toString().slice(2)
    done()
  },
  // Updates the stored connection.
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