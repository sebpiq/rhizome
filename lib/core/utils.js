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
  , async = require('async')
  , _ = require('underscore')
  , coreMessages = require('./messages')

// Simple utility to assign, re-assign and manage ids
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

// Gets a free file path in `dirName`
var getFreeFilePath = exports.getFreeFilePath = function(dirName, done, extension, byteNum) {
  byteNum = byteNum || 4
  extension = extension || ''
  var fileName = '', filePath
    , i, length, buf = crypto.randomBytes(byteNum)
  for (i = 0, length = buf.length; i < length; i++)
    fileName += buf[i].toString(10)
  filePath = path.join(dirName, fileName) + extension
  fs.open(filePath, 'wx', function(err, fd) {
    if (err && err.code === 'EEXIST') getFreeFilePath(dirName, done, extension, byteNum)
    else if (err) done(err)
    else done(null, filePath)
  })
}

// Utility to save `blob` in `dirName`, automatically assigning it a filename.
// When this is complete, `done(err, filePath)` is called.
exports.saveBlob = function(dirName, blob, done, extension) {
  async.waterfall([
    function(next) { getFreeFilePath(dirName, next, extension) },
    function(filePath, next) { fs.writeFile(filePath, blob, function(err) { next(err, filePath) }) }
  ], done)
}

// A very simple queue to manage queued connections
var Queue = exports.Queue = function() {
  this.elements = []
  Object.defineProperty(this, 'length', {
    get : function() { return this.elements.length }
  })
}

_.extend(Queue.prototype, {

  add: function(element) {
    var ind = this.elements.indexOf(element)
    if (ind === -1) this.elements.push(element)
  },

  remove: function(element) {
    var ind = this.elements.indexOf(element)
    if (ind !== -1) this.elements.splice(ind, 1)
  },

  pop: function() {
    return this.elements.shift()
  }

})

// ========================= NAMESPACE TREE ========================= //
exports.createNsTree = function() { return new NsTree() }

var NsNode = function(address) {
  this.address = address
  this.children = {}
  this.connections = []
  this.lastMessage = null
}

_.extend(NsNode.prototype, {

  // Calls `iter(ns)` on all the nodes in the subtree.
  forEach: function(iter) {
    var self = this
      , children = _.values(this.children)
    iter(this)
    if (children.length) _.forEach(children, function(ns) { ns.forEach(iter) })
  }

})

var NsTree = function() {
  this._root = { children: {}, address: '' }
}

_.extend(NsTree.prototype, {
  has: function(address) { return this._traverse(address) !== null },
  get: function(address, iter) { return this._traverse(address, iter, true) },

  _traverse: function(address, iter, create) {
    address = coreMessages.normalizeAddress(address)
    var parts = this._getParts(address)
      , ns = this._root
      , part, currentAddr
    while (parts.length) {
      part = parts.shift()
      if (!ns.children[part]) {
        if (create) {
          currentAddr = ns.address === '/' ? ('/' + part) : (ns.address + '/' + part)
          ns.children[part] = new NsNode(currentAddr)
        } else return null
      }
      ns = ns.children[part]
      if (iter) iter(ns)
    }
    return ns
  },

  // Split address into normalized parts.
  //     /a/b/c -> ['', 'a', 'b']
  //     / -> ['']
  _getParts: function(address) {
    if (address === '/') return ['']
    else return address.split('/')
  }

})

