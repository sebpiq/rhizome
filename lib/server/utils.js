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
  , fs = require('fs')
  , path = require('path')

var IdManager = exports.IdManager = function(idCount) {
  this.ids = []
  this.idCount = idCount
}

_.extend(IdManager.prototype, {

  get: function() {
    this.ids.sort()
    // Find the first free id
    var id = _.find(this.ids, function(id, k) {
      if (id !== k) return true
    })

    // if there isn't, try to assign an id in the end of the array
    if (!_.isNumber(id)) {
      if (this.ids.length < this.idCount) id = this.ids.length
      else return null
    } else id = id - 1

    this.ids.push(id)
    return id
  },

  free: function(id) {
    this.ids = _.reject(this.ids, function(other) { return other === id })
    this.ids.sort()
  }

})
