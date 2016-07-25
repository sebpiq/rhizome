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

var EventEmitter = require('events').EventEmitter
  , dgram = require('dgram')
  , net = require('net')
  , _ = require('underscore')
  , oscMin = require('osc-min')


exports.createClient = function(host, port, transport) {
  if (transport === 'udp') {
    return new UDPClient(host, port)
  } else if (transport === 'tcp') {
    return new TCPClient(host, port)
  } else throw new Error('invalid transport ' + transport)
}

exports.createServer = function(port, transport) {
  if (transport === 'udp') {
    return new UDPServer(port)
  } else if (transport === 'tcp') {
    return new TCPServer(port)
  } else throw new Error('invalid transport ' + transport)
}


// Base class for OSC over UDP/TCP server
var _BaseServer = exports._BaseServer = function(port) {
  EventEmitter.call(this)
  this.port = port
  this._status = 'stopped'
  this._createSocket()
}

_.extend(_BaseServer.prototype, EventEmitter.prototype, {
  // There's no way to know with node 0.10 that a port is already bound with UDP.
  // So to make things a bit more safe (especially for tests), we make sure
  // that we don't bind twice to the same port (otherwise unexpected things might happen).
  start: function(done) {
    if (this._status === 'stopped') {

      this._sock.once('listening', () => {
        this._status = 'started'
        this._sock.removeAllListeners('error')
        this._sock.on('error', (err) => this.emit('error', err))
        if (done) done()
      })

      this._sock.once('error', (err) => {
        this._sock.removeAllListeners('listening')
        if (done) done(err)
        else this.emit('error', err)
      })
      
      this._bindSocket()
    } else if (done) done()
  },

  stop: function(done) {
    if (this._status === 'started') {
      this._sock.removeAllListeners('close')
      this._sock.once('close', () => {
        this._status = 'stopped'
        this._createSocket()
        this._sock.on('error', () => {})
        done()
      })
      this._sock.close()
    } else done()
  },

  // This just creates the socket and adds the event handlers for messaging.
  // At this stage the socket is not bound yet
  // _createSocket: function() { throw new Error('Implement me') },

  // This should bind the socket
  // _bindSocket: function() { throw new Error('Implement me') }

})


// OSC over UDP server
var UDPServer = function(port) {
  _BaseServer.apply(this, arguments)
}

_.extend(UDPServer.prototype, _BaseServer.prototype, {

  transport: 'udp',

  _createSocket: function() {
    if (this._sock) this._sock.removeAllListeners()
    this._sock = dgram.createSocket('udp4')
    this._sock.on('message', (msg, rinfo) => {
      msg = oscMin.fromBuffer(msg)
      this.emit('message', msg.address, _.pluck(msg.args, 'value'), rinfo)
    })
  },

  _bindSocket: function() { this._sock.bind(this.port) }

})


// OSC over TCP server
var TCPServer = function(port) {
  _BaseServer.apply(this, arguments)
}

_.extend(TCPServer.prototype, _BaseServer.prototype, {

  transport: 'tcp',

  _createSocket: function() {
    if (this._sock) this._sock.removeAllListeners()
    this._sock = net.createServer()
    this._sock.on('connection', (connection) => {
      var buffers = []
      connection.on('error', (err) => this.emit('error', err))
      connection.on('data', (buf) => buffers.push(buf))
      connection.on('end', () => {
        var msg = oscMin.fromBuffer(Buffer.concat(buffers))
        this.emit('message', msg.address, _.pluck(msg.args, 'value'))
        connection.removeAllListeners()
        connection.on('error', () => {})
      })
    })
  },

  _bindSocket: function() { this._sock.listen(this.port) }

})


// Base class for OSC over UDP/TCP clients
var _BaseClient = function (host, port) {
  EventEmitter.call(this)
  this.host = host
  this.port = port
  this._ongoingSendsCount = 0
}

_.extend(_BaseClient.prototype, EventEmitter.prototype, {

  // Sends a message
  // send: function(address, args) { throw new Error('Implement me') }

  // Closes client and emits "close"
  close: function() {
    if (this._ongoingSendsCount) 
      this._sock.once('_sendsAllDone', () => this.emit('close'))
    else process.nextTick(() => this.emit('close'))
  },

  // These 2 callbacks allow to keep track of sending operations,
  // in order to be able to close the client in a clean way.
  _onSendStart: function() {
    this._ongoingSendsCount++
  },
  
  _onSendDone: function() {
    this._ongoingSendsCount--
    if (!this._ongoingSendsCount) this.emit('_sendsAllDone')
  } 

})


// OSC over UDP client
var UDPClient = function (host, port) {
  _BaseClient.apply(this, arguments)
  this._sock = dgram.createSocket('udp4')
  this._sock.on('error', (err) => this.emit('error', err))
}

_.extend(UDPClient.prototype, _BaseClient.prototype, {

  transport: 'udp',

  send: function (address, args) {
    args = args || []
    var buf = oscMin.toBuffer({ address: address, args: args })
    this._onSendStart()
    this._sock.send(buf, 0, buf.length, this.port, this.host, (err, bytesSent) => {
      if (bytesSent !== buf.length) 
        err = new Error('was not sent properly')
      if (err) this.emit('error', err)
      this._onSendDone()
    })
  },

  close: function() {
    this.on('close', () => {
      this._sock.removeAllListeners('error')
      this._sock.on('error', () => {})
      this._sock = null
    })
    _BaseClient.prototype.close.call(this)
  }

})


// OSC over TCP client
var TCPClient = function (host, port) {
  _BaseClient.apply(this, arguments)
}

_.extend(TCPClient.prototype, _BaseClient.prototype, {

  transport: 'tcp',

  send: function (address, args) {
    args = args || []
    var buf = oscMin.toBuffer({ address: address, args: args })
      , i = -1
      , size = 512
      , sock = net.connect(this.port, this.host)
    sock.on('error', (err) => this.emit('error', err))
    this._onSendStart()

    var writeNextPacket = () => {
      if ((size * i) < buf.length) {
        i++
        if (sock.write(buf.slice(size * i, size * (i + 1)))) writeNextPacket()
        else sock.once('drain', writeNextPacket)
      } else {
        sock.end()
      }
    }
    sock.on('connect', writeNextPacket)
    sock.on('close', () => {
      sock.removeAllListeners()
      sock.on('error', () => {}) // Silencing potential errors
      this._onSendDone()
    })
  }

})