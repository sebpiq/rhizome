var osc = require('node-osc')
  , debug = require('debug')('mmhl.osc')
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

