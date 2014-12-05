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


var BaseStore = exports.BaseStore = function() {}

_.extend(BaseStore.prototype, {
  // Starts the persistence store
  start: function(done) {},

  // Stops the persistence store
  stop: function(done) {},

  // Checks if the connection `namespace:id` already exists, and calls `done(err, true/false)`.
  connectionExists: function(namespace, id, done) {},

  // Saves the connection in `namespace` and calls `done(err)`.
  connectionSave: function(namespace, connection, done) {},

  // Restores the connection with previous data in the storage and calls `done(err)`.
  // If the connection didn't exist, `DoesNotExistError` is returned.
  connectionRestore: function(namespace, connection, done) {},

  // Save an event in the storage. `done(err)` is optional.
  // `event` has the following structure :
  //   `{when: <timestamp>, what: <event type>, who: <what it refers to>}`
  eventInsert: function(event, done) {}
})


// Store that does not store the data
var NoStore = exports.NoStore = function() {}
inherits(NoStore, BaseStore)
_.extend(BaseStore.prototype, {
  start: function(done) {done()},
  stop: function(done) {done()},
  connectionExists: function(namespace, id, done) {done()},
  connectionSave: function(namespace, connection, done) {done()},
  connectionRestore: function(namespace, connection, done) {done()},
  eventInsert: function(event, done) {done()}
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
inherits(NEDBStore, BaseStore)

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

  connectionExists: function(namespace, id, done) {
    var query = { _id: this._getId(namespace, id) }
    this._connectionsCollection.findOne(query, function(err, connection) {
      if (err) done(err)
      else if (connection) done(null, true)
      else done(null, false)
    })
  },

  connectionSave: function(namespace, connection, done) {
    var self = this
    this.connectionExists(namespace, connection.id, function(err, exists) {
      if (err) return done(err)

      var _doFinally = function(err) { done(err) }
        , connectionData = connection.serialize()
        , doc = {_id: self._getId(namespace, connection.id), data: connectionData}

      if (!exists)
        self._connectionsCollection.insert(doc, _doFinally)
      else {
        var query = {_id: self._getId(namespace, connection.id)}
        self._connectionsCollection.update(query, doc, _doFinally)
      }
    })
  },

  connectionRestore: function(namespace, connection, done) {
    var query = {_id: this._getId(namespace, connection.id)}
    this._connectionsCollection.findOne(query, function(err, doc) {
      if (err) return done(err)
      if (doc) {
        connection.deserialize(doc.data)
        done()
      } else done(new Error('connection does not exist ' + namespace + ':' + connection.id))
    })
  },

  eventInsert: function(event, done) {
    event =_.pick(event, ['when', 'what', 'who'])
    this._eventsCollection.insert(event, function(err) { done(err) })
  },

  eventList: function(done) {
    this._eventsCollection.find({}).sort({when: 1}).exec(function(err, events) {
      if (err) return done(err)
      done(null, events.map(function(event) {
        return _.pick(event, ['when', 'what', 'who'])
      }))
    })
  },

  _getId: function(namespace, id) {
    return namespace + ':' + id
  }

})