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
  , async = require('async')
  , debug = require('debug')('rhizome.osc')
  , websockets = require('./websockets')
  , utils = require('./utils')
  , connections = require('./connections')
  , shared = require('../shared')
  , sendJSON = shared.sendJSON
  , normalizeAddress = shared.normalizeAddress

var oscServer, oscConnections

exports.start = function(config, done) {

  oscServer = new utils.OSCServer(config.oscPort)
  oscConnections = config.clients.map(function(clientConfig) { return new OSCConnection(clientConfig) })
  oscServer.on('message', function (address, args, rinfo) {

    // If system message, we proxy it to the connections with corresponding ip address.
    if (shared.sysAddressRe.exec(address)) {
      oscConnections.forEach(function(connection) {
        if (connection.ip === rinfo.address) connection.onSysMessage(address, args, rinfo)
      })

    // If normal message, we traverse the namespaces from / to `address` and send to all sockets
    } else connections.send(address, args)

  })
  done(null)
}

exports.stop = function(done) {
  if (oscServer) {
    oscServer.close()
    oscServer = null
    oscConnections.forEach(connections.remove)
  }
  done()
}


/* -------------------- OSC Connections -------------------- */
// Class to handle connections from OSC clients. 
var OSCConnection = function(clientConfig) {
  this.ip = clientConfig.ip
  this.appPort = clientConfig.appPort
  this.appClient = new utils.OSCClient(clientConfig.ip, clientConfig.appPort)
  if (clientConfig.useBlobClient) {
    this.blobClient = new utils.OSCClient(clientConfig.ip, clientConfig.blobClientPort)
  }
}

_.extend(OSCConnection.prototype, {

  send: function(address, args) {
    if (this.blobClient && args.some(function(arg) { return arg instanceof Buffer })) {
      this.blobClient.send(address, args)
    } else this.appClient.send(address, args)
  },

  onSysMessage: function(address, args, rinfo) {

    debug('received OSC address \'' + address + '\' args [' + args + ']')

    // When a client wants to receive messages sent to an address,
    // we subscribe him and send acknowldgement.
    if (address === shared.subscribeAddress) {
      var appPort = args[0], toAddress = args[1]
      if (appPort === this.appPort) {
        connections.subscribe(toAddress, this)
        this.send(shared.subscribedAddress, [this.appPort, toAddress])
      }

    // When an app client wants to send a blob, it sends a message to the server, which then asks the
    // blob client to actually send the blob. That way the user never deals directly with the blob client :
    //    APP                SERVER            BLOB-CLIENT
    //    sendBlobAddress ->
    //                    sendBlobAddress ->
    //                                  <-   /some/address <blob>, <arg1>, >arg2>, ...
    } else if (this.blobClient && address === shared.sendBlobAddress)
      this.blobClient.send(shared.sendBlobAddress, args)

  }

})
