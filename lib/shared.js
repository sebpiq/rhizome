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

// Allows us to use the same object for browser and Node.js
var Blob = exports.Blob = typeof window === 'undefined' ? Buffer : window.Blob

var sendJSON = exports.sendJSON = function(socket, msg) {
  socket.send(JSON.stringify(msg))
}

var normalizeAddress = exports.normalizeAddress = function(address) {
  if (address === '/') return address
  else if (_.last(address) === '/') return address.slice(0, -1)
  else return address
}

// Validates that an address entered by a user is valid.
// Returns `null` if the address is valid, an error message otherwise.
exports.validateAddress = function(address) {
  if (address[0] !== '/') return 'should start with /'
  if (sysAddressRe.exec(address)) return 'system addresses are reserved for the system'
  return null
}

// Regular expression for system addresses.
var sysAddressRe = exports.sysAddressRe = /^\/sys.*$/

exports.subscribeAddress = '/sys/subscribe'
exports.subscribedAddress = '/sys/subscribed'
exports.sendBlobAddress = '/sys/blob'
exports.errorAddress = '/sys/error'
exports.connectionCloseAddress = '/sys/connection/close'
exports.connectionOpenAddress = '/sys/connection/open'

/* -------------------- Namespace tree -------------------- */
exports.createNsTree = function(meths) {
  var nsClass = function() { NsNode.apply(this, arguments) }
  _.extend(nsClass.prototype, NsNode.prototype, _.pick(meths, 'createData', 'mergeData'))
  return new NsTree(nsClass)
}

var NsNode = function(address) {
  this.address = address
  this.children = {}
  this.data = this.createData()
}

_.extend(NsNode.prototype, {

  forEach: function(iter) {
    var self = this
      , children = _.values(this.children)
    iter(this)
    if (children.length) _.forEach(children, function(ns) { ns.forEach(iter) })
  }

})

var NsTree = function(nsClass) {
  this._root = { children: {}, address: '' }
  this.nsClass = nsClass
}

_.extend(NsTree.prototype, {

  has: function(address) { return this._traverse(address) !== null },

  get: function(address, iter) { return this._traverse(address, iter, true) },

  _traverse: function(address, iter, create) {
    address = normalizeAddress(address)
    var parts = this._getParts(address)
      , ns = this._root
      , part, currentAddr
    while (parts.length) {
      part = parts.shift()
      if (!ns.children[part]) {
        if (create) {
          currentAddr = ns.address === '/' ? ('/' + part) : (ns.address + '/' + part)
          ns.children[part] = new this.nsClass(currentAddr)
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


/* -------------------- Blob transactions -------------------- */
// Since we can't send text with binary data, we need to send the text and blobs separately,
// and make sure that the message is reconstructed properly on the other side.
var BlobTransaction = exports.BlobTransaction = function(socket, sendCommand, receiveCommand, eventEmitter) {
  this.eventEmitter = eventEmitter
  this.socket = socket
  this.sendCommand = sendCommand
  this.receiveCommand = receiveCommand
  // `_sendLock` helps to make sure that there isn't several blob being sent in parallel.
  this._sendLock = false
  this._sendQueue = []
  this._receiveLock = false
}

_.extend(BlobTransaction.prototype, {

  send: function(address, args) {
    this._sendQueue.push({address: address, args: args})
    this._nextTransaction()
  },

  _nextTransaction: function() {
    if ((!this._sendLock) && this._sendQueue.length > 0) {
      this._sendLock = true
      var self = this
        , msg = this._sendQueue.shift(), args = msg.args
        , blobs = [], blobArgIndices = []

      // Isolate the blobs from the other message arguments
      _.forEach(args, function(arg, i) {
        if (arg instanceof Blob) {
          blobs.push(arg)
          blobArgIndices.push(i)
          args[i] = null
        }
      })

      // Send first the data about the original message.
      sendJSON(this.socket, {
        command: this.sendCommand,
        address: msg.address,
        args: args,
        blobArgIndices: blobArgIndices
      })

      // and then send all the blobs one by one.
      this._sendBlobs(blobs, function(err) {
        if (err) throw err // TODO: better handling
        else {
          // The whole message and blobs have been sent, so it is safe to unlock.
          self._sendLock = false
          self._nextTransaction()
        }
      })
    }
  },

  // Sends, and waits for acknowledgement
  _sendBlobs: function(blobs, done) {
    var self = this
    this.eventEmitter.once('command:' + self.sendCommand, function(msg) {
      self.socket.send(blobs.shift())
      if (blobs.length) self._sendBlobs(blobs, done) 
      else if (msg.status === 0) done()
      else done(new Error(msg.error))
    })
  },

  receive: function(blobTransaction) {
    var self = this
    if (this._receiveLock) throw new Error('a transaction is already happening') // TODO error handling
    this._receiveLock = true
    sendJSON(this.socket, {command: this.receiveCommand, status: 0})
    this._receiveBlobs(blobTransaction, function() {
      self._receiveLock = false
      self.eventEmitter.emit('command:message', {
        command: 'message',
        address: blobTransaction.address,
        args: blobTransaction.args
      })
    })
  },

  // Receives and sends an acknowledgement
  _receiveBlobs: function(blobTransaction, done) {
    var self = this
    this.eventEmitter.once('blob', function(blob) {
      blobTransaction.args[blobTransaction.blobArgIndices.shift()] = blob
      sendJSON(self.socket, {command: self.receiveCommand, status: 0})
      if (blobTransaction.blobArgIndices.length > 0) self._receiveBlobs(blobTransaction, done)
      else done(null, blobTransaction)
    })
  }

})
