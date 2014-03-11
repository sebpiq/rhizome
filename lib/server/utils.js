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
  , EventEmitter = require('events').EventEmitter
  , async = require('async')
  , dgram = require('dgram')
  , oscMin = require('osc-min')
  , _ = require('underscore')

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
var getFreeFilePath = exports.getFreeFilePath = function(dirName, done, byteNum) {
  byteNum = byteNum || 4
  var fileName = '', filePath
    , i, length, buf = crypto.randomBytes(byteNum)
  for (i = 0, length = buf.length; i < length; i++)
    fileName += buf[i].toString(10)
  filePath = path.join(dirName, fileName)
  fs.open(filePath, 'wx', function(err, fd) {
    if (err && err.code === 'EEXIST') getFreeFilePath(dirName, done, byteNum)
    else if (err) done(err)
    else done(null, filePath)
  })
}

// Utility to save `blob` in `dirName`, automatically assigning it a filename.
// When this is complete, `done(err, filePath)` is called.
exports.saveBlob = function(dirName, blob, done) {
  async.waterfall([
    function(next) { getFreeFilePath(dirName, next) },
    function(filePath, next) { fs.writeFile(filePath, blob, function(err) { next(err, filePath) }) }
  ], done)
}

// -------------------- OSC -------------------- //
var OSCClient = exports.OSCClient = function (host, port) {
  this.host = host
  this.port = port
  this._sock = dgram.createSocket('udp4')
}

_.extend(OSCClient.prototype, {

  send: function (address, args) {
    args = args || []
    var buf = oscMin.toBuffer({ address: address, args: args })
    this._sock.send(buf, 0, buf.length, this.port, this.host)
  }

})

// TODO better error handling
var OSCServer = exports.OSCServer = function(port) {
  var self = this
  EventEmitter.call(this)
  this.port = port
  this._createSocket()
}
OSCServer._portsBound = []

_.extend(OSCServer.prototype, EventEmitter.prototype, {

  start: function(done) {
    var self = this
    if (this._status === 'stopped') {
      if (!_.contains(OSCServer._portsBound, this.port)) {
        
        OSCServer._portsBound.push(this.port)

        this._sock.once('listening', function() {
          self._status = 'started'
          self._sock.removeAllListeners('error')
          done()
        })

        this._sock.once('error', function(err) {
          self._sock.removeAllListeners('listening')
          done(err)
        })
        
        this._sock.bind(this.port)

      } else done(new Error('this port is already bound'))
    } else done()
  },

  stop: function(done) {
    var self = this
    if (this._status === 'started') {
      this._sock.once('close', function() {
        self._status = 'stopped'
        OSCServer._portsBound.splice(OSCServer._portsBound.indexOf(self.port), 1)
        self._createSocket()
        done()
      })
      this._sock.close()
    } else done()
  },

  _createSocket: function() {
    var self = this
    if (this._sock) this._sock.removeAllListeners()
    this._status = 'stopped'
    this._sock = dgram.createSocket('udp4')
    this._sock.on('message', function (msg, rinfo) {
      msg = oscMin.fromBuffer(msg)
      self.emit('message', msg.address, _.pluck(msg.args, 'value'), rinfo)
    })
  }
})

