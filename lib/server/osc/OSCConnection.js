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
  , debug = require('debug')('rhizome.server.osc')
  , moscow = require('moscow')
  , Connection = require('../core/Connection')
  , shared = require('../../shared')

// Class to handle connections from OSC clients. 
var OSCConnection = module.exports = function(clientConfig) {
  Connection.apply(this)
  this.ip = clientConfig.ip
  this.appPort = clientConfig.appPort
  this.appClient = new moscow.createClient(clientConfig.ip, clientConfig.appPort, 'udp')
}

_.extend(OSCConnection.prototype, Connection.prototype, {

  send: function(address, args) {
    if (this.blobClient && args.some(function(arg) { return arg instanceof Buffer })) {
      debug(this.toString() + ' sending to blob client ' + address + ' ' + shared.argsToString(args))
      args = [this.appPort].concat(args)
      this.blobClient.send(address, args)
    } else this.appClient.send(address, args)
  },

  onSysMessage: function(address, args) {
    var self = this

    // Change configuration of the client
    if (address === shared.configureAddress) {
      var param = args[0]
      if (param === 'blobClient') {
        var blobsPort = args[1] || 44444
        this.blobClient = new moscow.createClient(this.ip, blobsPort, 'tcp')
        this.blobClient.on('error', function(err) {
          if (err.code === 'ECONNREFUSED')
            console.error(self.toString() + ' blob client refused connection')
          else console.error(err)
        })
        this.appClient.send(shared.configuredAddress, [blobsPort])
      }

    // Receives the request to send a blob, first checks the address,
    // and then asks the blob client to send the requested blob
    } else if (this.blobClient && address === shared.sendBlobAddress) {
      debug(this.toString() + ' asking blob client to send ' + shared.argsToString(args))
      var originalAddress = args[0]
        , err = shared.validateAddressForSend(originalAddress)
      if (err) this.appClient.send(shared.errorAddress, [err])
      else this.blobClient.send(shared.sendBlobAddress, args)

    } else Connection.prototype.onSysMessage.apply(this, arguments)
  },

  toString: function() { return 'OSCConnection(' + this.ip  + ', ' + this.appPort + ')' }
})
