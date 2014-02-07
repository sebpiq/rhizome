var _ = require('underscore')
  , fs = require('fs')
  , path = require('path')
  , EventEmitter = require('events').EventEmitter
  , osc = require('node-osc')
  , debug = require('debug')('mmhl.websocket')
  , WebSocketServer = require('ws').Server
  , config = require('../../config')
  , utils = require('./utils')
  , shared = require('../shared')
  , sendJSON = shared.sendJSON

var idManager = new utils.IdManager(config.websocket.usersLimit)
  , oscClients = config.osc.clients.map(function(client) {
    return new osc.Client(client.ip, client.port)
  })
  , server = exports
  , wsServer
  , oscServer


server.namespaces = shared.createNsTree({

  mergeData: function(merged, data) {},

  createData: function() { return { sockets: [] } }

})

server.sockets = []

server.forget = function(socket) {
  socket.close()
  socket.removeAllListeners()
  server.namespaces.get('/').forEach(function(ns) {
    ns.data.sockets = _.difference(ns.data.sockets, [socket])
  })
  server.sockets = _.difference(server.sockets, [socket])
}


// -------------------- WebSocket server -------------------- //

server.start = function(opts) {
  opts = _.defaults(opts, {path: config.websocket.rootUrl, done: null})
  wsServer = new WebSocketServer(opts)

  wsServer.on('listening', function() {
    debug('ws server listening')
    opts.done(null, server)
  })

  wsServer.on('connection', function(socket) {
    var userId = idManager.get()

    if (userId !== null) {
      server.sockets.push(socket)
      debug('connected - now ' + server.sockets.length + ' sockets')

      socket.on('message', function(msg, flags) {
        if (!flags.binary) {
          msg = JSON.parse(msg)

          if (msg.command === 'message') {
            debug('received message for address ' + msg.address + ' with args ' + args)
            oscClients.forEach(function(client) {
              client.send.apply(client, [msg.address].concat(msg.args))
            })

          } else if (msg.command === 'listen') {
            server.namespaces.get(msg.address).data.sockets.push(socket)
            sendJSON(socket, _.extend(msg, {status: 0}))

          } else throw new Error('unknown command ' + msg.command)
        } else {
          // message is a blob
        }
      })

      socket.on('close', function() {
        server.forget(socket)
        debug('closed - now ' + server.sockets.length + ' sockets')
      })

      sendJSON(socket, {command: 'connect', status: 0, userId: userId})

    } else {
      debug('FULL : ' + server.sockets.length + ' connected')
      sendJSON(socket, {command: 'connect', status: 1, error: 'the server is full'})
      server.forget(socket)
    }

  })

}

server.stop = function(opts) {
  wsServer.close(opts.done)
}


// -------------------- OSC server -------------------- //
oscServer = new osc.Server(config.osc.portIn, config.osc.host)

oscServer.on('message', function (msg, rinfo) {
  var address = msg[0]
    , args = msg.slice(1)
    , toSend = {
      command: 'message',
      args: args,
      address: server.namespaces.normalize(address)
    }
  debug('received OSC address \'' + address + '\' args [' + args + ']')
  // We traverse the namespaces from / to `address` and send to all sockets
  server.namespaces.get(address, function(ns) {
    ns.data.sockets.forEach(function(socket) { sendJSON(socket, toSend) })
  })
})
