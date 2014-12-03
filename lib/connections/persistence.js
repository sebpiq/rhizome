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
  connectionRestore: function(namespace, connection, done) {}
})

// Creates a nedb persistance store. `dbDir` is the absolute path
// of the folder where the db files will be stored.
var NEDBStore = exports.NEDBStore = function(dbDir) {
  this._connectionsCollection = null
  this._dbDir = dbDir
  this._collectionFile = path.join(dbDir, 'connections.db')
}
inherits(NEDBStore, BaseStore)

_.extend(NEDBStore.prototype, {

  start: function(done) {
    this._connectionsCollection = new nedb({ filename: this._collectionFile })
    this._connectionsCollection.loadDatabase(done)
  },

  stop: function(done) {
    this._connectionsCollection = null
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

  _getId: function(namespace, id) {
    return namespace + ':' + id
  }

})