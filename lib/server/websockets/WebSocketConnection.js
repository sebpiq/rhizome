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
  , connections = require('../connections')
  , Connection = require('../core/Connection')
  , shared = require('../../shared')
  , sendJSON = shared.sendJSON

// Class to handle connections from websocket clients.
var WebSocketConnection = module.exports = function(socket, server) {
  Connection.apply(this, [server])
  this.blobTransaction = new shared.BlobTransaction(socket, 'blobFromServer', 'blobFromWeb', this)
  this.socket = socket
  this.socket.on('message', this.onMessage.bind(this))
  this.socket.once('close', this.onClosed.bind(this))
  this.on('command:message', this.onMessageCommand.bind(this))
  this.on('command:blobFromWeb', this.onBlobFromWebCommand.bind(this))
}

_.extend(WebSocketConnection.prototype, Connection.prototype, {

  // Sends a message to the web page.
  // If there is an error, for example the socket is closed, it fails silently.
  send: function(address, args) {
    try {
      if (args.some(function(arg) { return arg instanceof Buffer })) {
        this.blobTransaction.send(address, args)
      } else sendJSON(this.socket, { command: 'message', address: address, args: args })
    } catch (err) {
      if (this.socket.readyState !== 'OPEN')
        console.error('web socket send failed : ' + err)
      else throw err
    }
  },

  // Immediately closes the connection, cleans event handlers, etc ...
  // NB: we don't need to remove the socket from `this.server.clients`, as `node-ws` is handling this.
  onClosed: function() {
    this.socket.removeAllListeners()
    this.socket.close()
    Connection.prototype.onClosed.apply(this)
  },

  onMessage: function(msg, flags) {
    if (!flags.binary) {
      var msg = JSON.parse(msg)
      this.emit('command:' + msg.command, msg)
    } else this.emit('blob', msg)
  },

  // Simple message `/some/address arg1 arg2 arg3 ...`
  onMessageCommand: function(msg) {
    var address = msg.address, args = msg.args
    if (shared.sysAddressRe.exec(address)) this.onSysMessage(address, args)
    else {
      var err = connections.send(msg.address, msg.args)
      if (err) this.send(shared.errorAddress, err)
    }
  },

  // Receiving a blob send by the client a blob transaction
  onBlobFromWebCommand: function(msg) {
    this.blobTransaction.receive(msg)
  },

  toString: function() { return 'WSConnection(' + this.userId + ')' }
})
