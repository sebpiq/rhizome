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

var crypto = require('crypto')
  , fs = require('fs')
  , path = require('path')
  , _ = require('underscore')

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

// TODO : handle error code so that we know that we deal with "file exists" and not something else
var getFreeFilePath = exports.getFreeFilePath = function(directory, done, byteNum) {
  byteNum = byteNum || 4
  var fileName = '', filePath
    , i, length, buf = crypto.randomBytes(byteNum)
  for (i = 0, length = buf.length; i < length; i++)
    fileName += buf[i].toString(10)
  filePath = path.join(directory, fileName)
  fs.open(filePath, 'wx', function(err, fd) {
    if (err) getFreeFilePath(directory, done, byteNum)
    else done(null, filePath)
  })
}
