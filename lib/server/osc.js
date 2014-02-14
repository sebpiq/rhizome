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
  , async = require('async')
  , debug = require('debug')('rhizome.osc')
  , websockets = require('./websockets')
  , utils = require('./utils')
  , shared = require('../shared')
  , sendJSON = shared.sendJSON
  , normalizeAddress = shared.normalizeAddress

var oscServer

exports.start = function(config, done) {

  oscServer = new utils.OSCServer(config.osc.port)

  oscServer.on('message', function (address, args, rinfo) {
    var toSend = {
      command: 'message',
      address: normalizeAddress(address),
      args: args
    }
    debug('received OSC address \'' + address + '\' args [' + args + ']')

    if (shared.sysAddressRe.exec(address)) {

      // When received a blob, we proxy it to the websockets
      if (address === shared.fromDesktopBlobAddress) {
        var originalAddress = args[0]
          , blob = args[1]
        utils.saveBlob(config.server.blobsDirName, blob, function(err, filePath) {
          var toSend = {command: 'blob', address: originalAddress, filePath: filePath}
          websockets.nsTree.get(originalAddress, function(ns) {
            ns.data.sockets.forEach(function(socket) { sendJSON(socket, toSend) })
          })
        })
      }

    // If blob address, we ask for the corresponding desktop client to send us the blob.
    } else if (shared.blobAddressRe.exec(address)) {
      var filePath = args[0]
        , desktopClientHostName = rinfo.address
        , sendToDesktopClient = new utils.OSCClient(desktopClientHostName, config.desktopClient.port)
      sendToDesktopClient.send(shared.gimmeBlobAddress, [address, filePath])

    // If normal message, we traverse the namespaces from / to `address` and send to all sockets
    } else {
      websockets.nsTree.get(address, function(ns) {
        ns.data.sockets.forEach(function(socket) { sendJSON(socket, toSend) })
      })
    }
  })

  done(null)

}

exports.stop = function(done) {
  oscServer.close()
  done()
}

