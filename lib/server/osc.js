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

var fs = require('fs')
  , _ = require('underscore')
  , debug = require('debug')('rhizome.server.osc')
  , utils = require('./utils')
  , connections = require('./connections')
  , Connection = require('./Connection')
  , shared = require('../shared')

var oscServer, oscConnections

exports.start = function(config, done) {
  debug('starting')

  oscServer = new utils.OSCServer(config.oscPort)
  oscConnections = config.clients.map(function(clientConfig) { return new OSCConnection(clientConfig) })
  oscServer.on('message', function (address, args, rinfo) {

    // If system message, we proxy it to the connections with corresponding ip address.
    // System messages should always have the appPort as first argument.
    if (shared.sysAddressRe.exec(address)) {
      var appPort = args[0], args = args.slice(1)
      oscConnections.forEach(function(connection) {
        if (connection.ip === rinfo.address && connection.appPort === appPort)
          connection.onSysMessage(address, args, rinfo)
      })

    // If normal message, we traverse the namespaces from / to `address` and send to all sockets
    } else {
      var addrErr = shared.validateAddressForSend(address)
      if (addrErr) {
        oscConnections.forEach(function(connection) {
          if (connection.ip === rinfo.address)
            connection.send(shared.errorAddress, [addrErr])
        })
      } else connections.send(address, args)
    }

  })
  oscServer.start(done)
}

exports.stop = function(done) {
  debug('stopping')

  if (oscServer) {
    oscServer.stop(function(err) {
      oscServer = null
      oscConnections.forEach(connections.remove)
      done(err)
    })
  } else done()
}


/* ========================= OSC Connections ========================= */
// Class to handle connections from OSC clients. 
var OSCConnection = function(clientConfig) {
  Connection.apply(this)
  this.ip = clientConfig.ip
  this.appPort = clientConfig.appPort
  this.appClient = new utils.OSCClient(clientConfig.ip, clientConfig.appPort)
  if (clientConfig.useBlobClient) {
    this.blobClient = new utils.OSCClient(clientConfig.ip, clientConfig.blobClientPort)
  }
}

_.extend(OSCConnection.prototype, Connection.prototype, {

  send: function(address, args) {
    if (this.blobClient && args.some(function(arg) { return arg instanceof Buffer })) {
      this.blobClient.send(address, args)
    } else this.appClient.send(address, args)
  },

  onSysMessage: function(address, args) {
    debug('received OSC address \'' + address + '\' args [' + args + ']')

    // When an app client wants to send a blob, it sends a message to the server, which then asks the
    // blob client to actually send the blob. That way the user never deals directly with the blob client :
    //    APP                SERVER            BLOB-CLIENT
    //    sendBlobAddress ->
    //                    sendBlobAddress ->
    //                                  <-   /some/address <blob>, <arg1>, >arg2>, ...
    if (this.blobClient && address === shared.sendBlobAddress)
      this.blobClient.send(shared.sendBlobAddress, args)

    else Connection.prototype.onSysMessage.apply(this, arguments)
  }

})
