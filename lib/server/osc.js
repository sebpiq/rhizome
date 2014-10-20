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
  , debug = require('debug')('rhizome.server.osc')
  , utils = require('./core/utils')
  , oscCore = require('./core/osc-core')
  , Connection = require('./core/Connection')
  , connections = require('./connections')
  , shared = require('../shared')

var oscServer, blobsReceiveServer, oscConnections

exports.start = function(config, done) {
  debug('starting')

  // List of all the connected OSC clients
  oscConnections = []

  // This is the OSC server that receives normal messages
  oscServer = new oscCore.createOSCServer(config.oscPort, 'udp')
  oscServer.on('message', function (address, args, rinfo) {
    debug('message ' + address)

    // System messages should always have the appPort as first argument.
    if (shared.sysAddressRe.exec(address)) {
      var appPort = args[0], args = args.slice(1)

      if (address === shared.connectAddress) {
        var clientConfig = { appPort: appPort, ip: rinfo.address }
        if (args.length >= 1) clientConfig.useBlobClient = !!args[0] // convert int to bool
        if (args.length === 2) clientConfig.blobsPort = args[1]
        _.defaults(clientConfig, { useBlobClient: false, blobsPort: 44444 })
        oscConnections.push(new OSCConnection(clientConfig))

      // If system message, we proxy it to the connections with corresponding `ip`, `appPort` 
      } else {
        oscConnections.forEach(function(connection) {
          if (connection.ip === rinfo.address && connection.appPort === appPort)
            connection.onSysMessage(address, args, rinfo)
        })
      }

    // If normal message, we traverse the namespaces from / to `address` and send to all sockets
    } else {
      var err = shared.validateAddressForSend(address)
      if (err) {
        oscConnections.forEach(function(connection) {
          if (connection.ip === rinfo.address)
            connection.send(shared.errorAddress, [err])
        })
      } else connections.send(address, args)
    }

  })

  // This is the server on which we receive the blobs sent by the blob client.
  // When an app client wants to send a blob, it sends a message to the server, which then asks the
  // blob client to actually send the blob. That way the user never deals directly with the blob client :
  //    APP                oscServer                     BLOB-CLIENT                  blobsReceiveServer
  //    sendBlobAddress ->
  //                    sendBlobAddress ->
  //                                        /some/address <blob>, <arg1>, <arg2>, ->
  blobsReceiveServer = new oscCore.createOSCServer(config.blobsPort, 'tcp')
  blobsReceiveServer.on('message', function (address, args, rinfo) {
    connections.send(address, args)
  })

  async.series([
    oscServer.start.bind(oscServer),
    blobsReceiveServer.start.bind(blobsReceiveServer)
  ], done)
}

exports.stop = function(done) {
  debug('stopping')

  if (oscServer) {
    async.series([
      oscServer.stop.bind(oscServer),
      blobsReceiveServer.stop.bind(blobsReceiveServer)
    ], function(err) {
      oscServer = null
      blobsReceiveServer = null
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
  this.blobsPort = clientConfig.blobsPort
  this.appClient = new oscCore.createOSCClient(clientConfig.ip, clientConfig.appPort, 'udp')
  if (clientConfig.useBlobClient) {
    this.blobClient = new oscCore.createOSCClient(clientConfig.ip, clientConfig.blobsPort, 'tcp')
  }
  // Send acknowledgement that the OSC client was connected successfuly
  this.send(shared.connectedAddress, [ this.appPort ])
}

_.extend(OSCConnection.prototype, Connection.prototype, {

  send: function(address, args) {
    if (this.blobClient && args.some(function(arg) { return arg instanceof Buffer })) {
      debug(this.toString() + ' sending to blob client ' + address + ' ' + shared.argsToString(args))
      this.blobClient.send(address, args)
    } else this.appClient.send(address, args)
  },

  onSysMessage: function(address, args) {
    // Receives the request to send a blob, first checks the address,
    // and then asks the blob client to send the requested blob
    if (this.blobClient && address === shared.sendBlobAddress) {
      debug(this.toString() + ' asking blob client to send ' + shared.argsToString(args))
      var originalAddress = args[0]
        , err = shared.validateAddressForSend(originalAddress)
      if (err) this.appClient.send(shared.errorAddress, [err])
      else this.blobClient.send(shared.sendBlobAddress, args)

    } else Connection.prototype.onSysMessage.apply(this, arguments)
  },

  toString: function() { return 'OSCConnection(' + this.ip  + ', ' + this.appPort + ')' }
})
