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

// Helper to limit the number of messages sent to the server.
// `time` is the minimum interval in milliseconds at which `sendValue(value)` will be called.
// Returns a function `receiveValue(value)` that receives the non-throttled stream of values.
exports.throttle = function(time, sendValue) {
  var currentValue = null
    , throttling = false
    , received = false

  // This function does the throttling. It first sends the current value,
  // then waits for `time` and re-starts itself if a new value has arrived meanwhile.
  var startThrottle = function() {
    sendValue(currentValue)
    throttling = true
    received = false
    setTimeout(function() {
      if (received === true) startThrottle()
      else throttling = false
    }, time)
  }

  // This is the function called by the user.
  var receiveValue = function(newValue) {
    received = true
    currentValue = newValue
    if (throttling === false) startThrottle()
  }

  return receiveValue
}

// Simple helper to send JSON to a socket
var sendJSON = exports.sendJSON = function(socket, msg) {
  socket.send(JSON.stringify(msg))
}

// Validates that argument list sent with a message is valid.
// Returns null if `args` is valid, a string indicating the error otherwise.
exports.validateArgs = function(args) {
  if (!_.isArray(args)) return '`args` should be an array'
  var arg, i, length
  for (i = 0, length = args.length; i < length; i++) {
    arg = args[i]
    if (!(_.isString(arg) || _.isNumber(arg) || arg instanceof Blob))
      return 'argument ' + i + ', invalid type'
  }
  return null
}

exports.argsToString = function(args) {
  return '[' + args.map(function(arg) {
    return (arg instanceof Blob) ? 'Blob(' + arg.length + ')' : arg
  }) + ']'
}

// Normalizes an address, removing the trailing slash
var normalizeAddress = exports.normalizeAddress = function(address) {
  if (address === '/') return address
  else if (_.last(address) === '/') return address.slice(0, -1)
  else return address
}

// Validates an address for subscription. Returns `null` if the address is valid, an error message otherwise.
exports.validateAddressForSub = function(address) {
  if (address[0] !== '/') return 'should start with /'
  if (sysAddressRe.exec(address)) return 'system addresses are reserved for the system'
  return null
}

// Validates an address for sending. Returns `null` if the address is valid, an error message otherwise.
exports.validateAddressForSend = function(address) {
  if (address[0] !== '/') return 'should start with /'
  if (broadcastAddressRe.exec(address)) return 'broadcast addresses are reserved for the system'
  return null
}

// Regular expression for system addresses.
var sysAddressRe = exports.sysAddressRe = /^\/sys.*$/
exports.connectAddress = '/sys/connect'
exports.connectedAddress = '/sys/connected'
exports.subscribeAddress = '/sys/subscribe'
exports.subscribedAddress = '/sys/subscribed'
exports.sendBlobAddress = '/sys/blob'
exports.errorAddress = '/sys/error'
exports.resendAddress = '/sys/resend'

// Regular expression for broadcast addresses.
var broadcastAddressRe = exports.broadcastAddressRe = /^\/broadcast.*$/
exports.connectionCloseAddress = '/broadcast/websockets/close'
exports.connectionOpenAddress = '/broadcast/websockets/open'


/* ========================= Blob transactions ========================= */
// Since we can't send text with binary data, we need to send blobs and extra arguments separately,
// and make sure that the message is reconstructed properly on the other side.
var BlobTransaction = exports.BlobTransaction = function(socket, sendCommand, receiveCommand, eventEmitter) {
  this.eventEmitter = eventEmitter
  this.socket = socket
  this.sendCommand = sendCommand
  this.receiveCommand = receiveCommand
  // `_sendLock`, `_receiveLock` help to make sure there isn't several blobs being sent/received in parallel.
  this._receiveLock = false
  this._sendLock = false
  this._sendQueue = []
}

_.extend(BlobTransaction.prototype, {

  // Send a message to `address`, with `args` containing blobs.
  // If there is already a pending transaction, this message is queued, and will be sent
  // when previous transactions are all done.
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

  // Receives a message containing blobs.
  // As infos about the original message and blobs are sent separately, this takes care 
  // of rebuilding the original message.
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
