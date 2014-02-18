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

  oscConnections = _.object(config.clients.map(function(clientConfig) {
    return [clientConfig.id, new OSCConnection(clientConfig)]
  }))

  oscServer.on('message', function (address, args, rinfo) {
    debug('received OSC address \'' + address + '\' args [' + args + ']')

    if (shared.sysAddressRe.exec(address)) {

      // When a client wants to receive messages sent to an address,
      // we subscribe him and send acknowldgement.
      if (address === shared.subscribeAddress) {
        var clientId = args[0]
          , toAddress = args[1]
          , oscConnection = oscConnections[clientId]
        connections.subscribe(toAddress, oscConnection)
        oscConnection.send(shared.subscribedAddress, [clientId, toAddress])

      // When received a blob, we proxy it to the websockets
      // TODO
      } else if (address === shared.fromDesktopBlobAddress) {
        var originalAddress = args[0]
          , blob = args[1]
        connections.send(originalAddress, blob)
      }

    // When a Pd client wants to send a blob, it sends a message to the server, which then asks the
    // desktop client to actually send the blob. That way the user never deals directly with the desktop client.
    } else if (shared.blobAddressRe.exec(address)) {
      var filePath = args[0]
        , ip = rinfo.address
        , clientInfos, sendToDesktopClient
      clientInfos = _.find(config.clients, function(client) {
        return client.ip === ip
      })
      sendToDesktopClient = new utils.OSCClient(ip, clientInfos.desktopClientPort)
      sendToDesktopClient.send(shared.gimmeBlobAddress, [address, filePath])

    // If normal message, we traverse the namespaces from / to `address` and send to all sockets
    } else connections.send(address, args)
  })

  done(null)
}

exports.stop = function(done) {
  oscServer.close()
  done()
}





var OSCConnection = function(clientConfig) {
  this.appClient = new utils.OSCClient(clientConfig.hostname, clientConfig.oscPort)
  if (clientConfig.desktopClientPort) {
    this.blobClient = new utils.OSCClient(clientConfig.hostname, clientConfig.desktopClientPort)
  }
}

_.extend(OSCConnection.prototype, {

  send: function(address, args) {
    if (Buffer.isBuffer(args)) {
      // TODO Desktop clients
      this.blobClient.send(shared.fromWebBlobAddress, [address, args])
    } else this.appClient.send(address, args)
  }

})

