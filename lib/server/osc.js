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

  oscServer = new utils.OSCServer(config.server.oscPort)
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
  oscServer.close()
  done()
}


/* -------------------- OSC Connections -------------------- */
// Class to handle connections from OSC clients. 
var OSCConnection = function(clientConfig) {
  this.ip = clientConfig.ip
  this.oscPort = clientConfig.oscPort
  this.appClient = new utils.OSCClient(clientConfig.hostname, clientConfig.oscPort)
  if (clientConfig.desktopClientPort) {
    this.blobClient = new utils.OSCClient(clientConfig.hostname, clientConfig.desktopClientPort)
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
      var oscPort = args[0], toAddress = args[1]
      debugger
      if (oscPort === this.oscPort) {
        connections.subscribe(toAddress, this)
        this.send(shared.subscribedAddress, [this.oscPort, toAddress])
      }

    // When an app client wants to send a blob, it sends a message to the server, which then asks the
    // desktop client to actually send the blob. That way the user never deals directly with the desktop client :
    //    APP                SERVER            DESKTOP-CLIENT
    //    sendBlobAddress ->
    //                    sendBlobAddress ->
    //                                  <-   /some/address <blob>, <arg1>, >arg2>, ...
    } else if (address === shared.sendBlobAddress)
      this.blobClient.send(shared.sendBlobAddress, args)

  }

})
