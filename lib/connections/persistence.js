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

var inherits = require('util').inherits
  , path = require('path')
  , async = require('async')
  , _ = require('underscore')
  , nedb = require('nedb')

// Store that does not store the data
var NoStore = exports.NoStore = function() {}
_.extend(NoStore.prototype, {
  // Starts the persistence store
  start: function(done) {done()},
  // Stops the persistence store
  stop: function(done) {done()},
  // Saves the connections in and calls `done(err)`.
  connectionInsertOrRestore: function(connection, done) {done()},
  // Restores the connection with previous data in the storage and calls `done(err)`.
  // If the connection didn't exist, `DoesNotExistError` is returned.
  connectionUpdate: function(connection, done) {done()},
  // Fetches all the connections ids in `namespace` and calls `done(err, ids)`.
  connectionIdList: function(namespace, done) {done(null, [])},
  // Save events in the storage. `done(err)` is optional.
  // each event has the fields : timestamp, eventType, namespace and id
  eventInsert: function(event, done) {done()},
  // Fetches all the events and calls `done(err, events)`.
  eventList: function(done) {done(null, [])}
})


// Creates a nedb persistance store. `dbDir` is the absolute path
// of the folder where the db files will be stored.
var NEDBStore = exports.NEDBStore = function(dbDir) {
  this._connectionsCollection = null
  this._eventsCollection = null
  this._dbDir = dbDir
  this._collectionFile = path.join(dbDir, 'connections.db')
  this._eventsFile = path.join(dbDir, 'events.db')
}

_.extend(NEDBStore.prototype, {

  start: function(done) {
    this._connectionsCollection = new nedb({ filename: this._collectionFile })
    this._eventsCollection = new nedb({ filename: this._eventsFile })
    async.series([
      this._connectionsCollection.loadDatabase.bind(this._connectionsCollection),
      this._eventsCollection.loadDatabase.bind(this._eventsCollection)
    ], done)
  },

  stop: function(done) {
    this._connectionsCollection = null
    this._eventsCollection = null
    done()
  },

  connectionUpdate: function(connection, done) {
    this._connectionsCollection.update(
      { _id: this._getId(connection.namespace, connection.id) },
      { '$set': { data: connection.serialize() } }
    , done)
  },

  connectionInsertOrRestore: function(connection, done) {
    var self = this
      , namespace = connection.namespace
      , id = connection.id

    this._connectionsCollection.findOne({ _id: this._getId(namespace, id) }, function(err, doc) {
      if (err) return done(err)

      // If the connection already exists, we restore it
      if (doc !== null) {
        var query = { _id: self._getId(namespace, id) }
        self._connectionsCollection.findOne(query, function(err, doc) {
          if (err) return done(err)
          if (doc) {
            connection.deserialize(doc.data)
            done()
          } else done(new Error('connection does not exist ' + namespace + ':' + id))
        })

      // Otherwise, we save it
      } else {
        self._connectionsCollection.insert({
          _id: self._getId(namespace, id),
          originalId: id,
          data: connection.serialize(),
          namespace: namespace
        }, done)
      }
    })
  },

  connectionIdList: function(namespace, done) {
    this._connectionsCollection.find({namespace: namespace}, function(err, docs) {
      if (err) return done(err)
      done(null, docs.map(function(doc) { return doc.originalId }))
    })
  },

  eventInsert: function(events, done) {
    events = events.map(function(event) {
      return _.pick(event, ['timestamp', 'id', 'namespace', 'eventType'])
    })
    this._eventsCollection.insert(events, function(err) { done(err) })
  },

  eventList: function(done) {
    this._eventsCollection.find({}).sort({timestamp: 1}).exec(function(err, events) {
      if (err) return done(err)
      done(null, events.map(function(event) {
        return _.pick(event, ['timestamp', 'id', 'namespace', 'eventType'])
      }))
    })
  },

  _getId: function(namespace, id) {
    return namespace + ':' + id
  },

  _trimNamespace: function(id) {
    return id.split(':')[1]
  }

})