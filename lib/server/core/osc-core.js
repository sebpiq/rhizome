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

// TODO : same rinfo with both transports 

var EventEmitter = require('events').EventEmitter
  , dgram = require('dgram')
  , net = require('net')
  , oscMin = require('osc-min')
  , async = require('async')
  , _ = require('underscore')
  , shared = require('../../shared')

exports.createOSCClient = function(host, port, transport) {
  if (transport === 'udp') {
    return new OSC_UDP_Client(host, port)
  } else if (transport === 'tcp') {
    return new OSC_TCP_Client(host, port)
  } else throw new Error('invalid transport ' + transport)
}

exports.createOSCServer = function(port, transport) {
  if (transport === 'udp') {
    return new OSC_UDP_Server(port)
  } else if (transport === 'tcp') {
    return new OSC_TCP_Server(port)
  } else throw new Error('invalid transport ' + transport)
}

var OSCServer = function(port) {
  var self = this
  EventEmitter.call(this)
  this.port = port
  this._status = 'stopped'
  this._createSocket()
}
OSCServer._portsBound = []
_.extend(OSCServer.prototype, EventEmitter.prototype, {
  // There's no way to know with node 0.10 that a port is already bound with UDP.
  // So to make things a bit more safe (especially for tests), we make sure
  // that we don't bind twice to the same port (otherwise unexpected things might happen).
  start: function(done) {
    var self = this
    if (this._status === 'stopped') {
      if (!_.contains(OSCServer._portsBound, this.port)) {

        OSCServer._portsBound.push(this.port)

        this._sock.once('listening', function() {
          self._status = 'started'
          self._sock.removeAllListeners('error')
          self._sock.on('close', function() {
            self.emit('error', new Error('socket closed unexpectedly'))
          })
          self._sock.on('error', function(err) {
            self.emit('error', err)
          })
          done()
        })

        this._sock.once('error', function(err) {
          self._sock.removeAllListeners('listening')
          done(err)
        })
        
        this._bindSocket()

      } else done(new Error('port ' + this.port + ' is already bound'))
    } else done()
  },

  stop: function(done) {
    var self = this
    if (this._status === 'started') {
      this._sock.removeAllListeners('close')
      this._sock.once('close', function() {
        self._status = 'stopped'
        OSCServer._portsBound = _.without(OSCServer._portsBound, self.port)
        self._createSocket()
        done()
      })
      this._sock.close()
    } else done()
  },

  // This just creates the socket and adds the event handlers for messaging.
  // At this stage the socket is not bound yet
  _createSocket: function() { throw new Error('Implement me') },

  // This should bind the socket
  _bindSocket: function() { throw new Error('Implement me') }

})

var OSCClient = function (host, port) {
  EventEmitter.call(this)
  this.host = host
  this.port = port
}
_.extend(OSCClient.prototype, EventEmitter.prototype, {

  send: function(address, args) {
    throw new Error('Implement me')
  }

})

// ========================= UDP ========================= //
// TODO better error handling
var OSC_UDP_Server = function(port) { OSCServer.apply(this, arguments) }
_.extend(OSC_UDP_Server.prototype, OSCServer.prototype, {

  transport: 'udp',

  _createSocket: function() {
    var self = this
    if (this._sock) this._sock.removeAllListeners()
    this._sock = dgram.createSocket('udp4')
    this._sock.on('message', function (msg, rinfo) {
      msg = oscMin.fromBuffer(msg)
      self.emit('message', msg.address, _.pluck(msg.args, 'value'), rinfo)
    })
  },

  _bindSocket: function() { this._sock.bind(this.port) }

})

var OSC_UDP_Client = function (host, port) {
  self = this
  OSCClient.apply(this, arguments)
  this._sock = dgram.createSocket('udp4')
  this._sock.on('error', function(err) { self.emit('error', err) })
}
_.extend(OSC_UDP_Client.prototype, OSCClient.prototype, {

  transport: 'udp',

  send: function (address, args) {
    args = args || []
    var buf = oscMin.toBuffer({ address: address, args: args })
    this._sock.send(buf, 0, buf.length, this.port, this.host, function(err, bytesSent) {
      if (bytesSent !== buf.length) err = new Error('was not sent properly')
      if (err) throw err
    })
  }

})

// ========================= TCP ========================= //
var OSC_TCP_Server = function(port) { OSCServer.apply(this, arguments) }
_.extend(OSC_TCP_Server.prototype, OSCServer.prototype, {

  transport: 'tcp',

  _createSocket: function() {
    var self = this
    if (this._sock) this._sock.removeAllListeners()
    this._sock = net.createServer()
    this._sock.on('connection', function(connection) {
      var buffers = []
      connection.on('data', function(buf) { buffers.push(buf) })
      connection.on('end', function() {
        var msg = oscMin.fromBuffer(Buffer.concat(buffers))
        self.emit('message', msg.address, _.pluck(msg.args, 'value'))
      })
    })
  },

  _bindSocket: function() { this._sock.listen(this.port) }

})

var OSC_TCP_Client = function (host, port) { OSCClient.apply(this, arguments) }
_.extend(OSC_TCP_Client.prototype, OSCClient.prototype, {

  transport: 'tcp',

  send: function (address, args) {
    args = args || []
    var self = this
      , buf = oscMin.toBuffer({ address: address, args: args })
      , i = -1
      , size = 512
      , sock = net.connect(this.port, this.host)
    sock.on('error', function(err) { self.emit('error', err) })

    var writeNextPacket = function() {
      if ((size * i) < buf.length) {
        i++
        if (sock.write(buf.slice(size * i, size * (i + 1)))) writeNextPacket()
        else sock.once('drain', writeNextPacket)
      } else sock.end()
    }
    sock.on('connect', writeNextPacket)
  }

})