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

var osc = require('node-osc')
  , debug = require('debug')('rhizome.osc')
  , websockets = require('./websockets')
  , shared = require('../shared')
  , sendJSON = shared.sendJSON
  , normalizeAddress = shared.normalizeAddress

var oscServer

exports.start = function(config, done) {

  oscServer = new osc.Server(config.osc.portIn, config.osc.host)

  oscServer.on('message', function (msg, rinfo) {
    var address = msg[0]
      , args = msg.slice(1)
      , toSend = {
        command: 'message',
        args: args,
        address: normalizeAddress(address)
      }
    debug('received OSC address \'' + address + '\' args [' + args + ']')
    // We traverse the namespaces from / to `address` and send to all sockets
    websockets.nsTree.get(address, function(ns) {
      ns.data.sockets.forEach(function(socket) { sendJSON(socket, toSend) })
    })
  })

  done(null)

}

exports.stop = function(done) {
  oscServer.close()
  done()
}

