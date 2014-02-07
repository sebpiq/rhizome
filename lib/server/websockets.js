var _ = require('underscore')
  , osc = require('node-osc')
  , debug = require('debug')('mmhl.websocket')
  , WebSocketServer = require('ws').Server
  , utils = require('./utils')
  , shared = require('../shared')
  , sendJSON = shared.sendJSON

var wsServer, allSockets
  , idManager, nsTree
  , oscServer, oscClients

exports.start = function(config, done) {
  var wsServerOpts = {
    path: config.websocket.rootUrl,
    server: config.server.instance,
    port: config.server.port
  }

  idManager = new utils.IdManager(config.websocket.usersLimit)

  oscClients = config.osc.clients.map(function(client) {
    return new osc.Client(client.ip, client.port)
  })

  nsTree = exports.nsTree = shared.createNsTree({
    createData: function() { return { sockets: [] } }
  })

  allSockets = exports.sockets = []

  wsServer = new WebSocketServer(wsServerOpts)

  wsServer.on('listening', function() {
    debug('ws server listening')
    done(null)
  })

  wsServer.on('connection', function(socket) {
    var userId = idManager.get()

    if (userId !== null) {
      socket.userId = userId
      allSockets.push(socket)
      debug('connected - now ' + allSockets.length + ' sockets')

      socket.on('message', function(msg, flags) {
        if (!flags.binary) {
          msg = JSON.parse(msg)

          if (msg.command === 'message') {
            debug('received message for address ' + msg.address + ' with args ' + args)
            oscClients.forEach(function(client) {
              client.send.apply(client, [msg.address].concat(msg.args))
            })

          } else if (msg.command === 'listen') {
            var addrSockets = nsTree.get(msg.address).data.sockets
            if (addrSockets.indexOf(socket) === -1) addrSockets.push(socket)
            sendJSON(socket, _.extend(msg, {status: 0}))

          } else throw new Error('unknown command ' + msg.command)
        } else {
          // message is a blob
        }
      })

      socket.on('close', function() {
        forget(socket)
        debug('closed - now ' + allSockets.length + ' sockets')
      })

      sendJSON(socket, {command: 'connect', status: 0, userId: userId})

    } else {
      debug('FULL : ' + allSockets.length + ' connected')
      sendJSON(socket, {command: 'connect', status: 1, error: 'the server is full'})
      forget(socket)
    }

  })

}

exports.stop = function(done) {
  wsServer.close()
  done()
}

var forget = exports.forget = function(socket) {
  var sInd
  idManager.free(socket.userId)
  socket.close()
  socket.removeAllListeners()
  nsTree.get('/').forEach(function(ns) {
    ns.data.sockets = _.without(ns.data.sockets, socket)
  })
  if ((sInd = allSockets.indexOf(socket)) !== -1) allSockets.splice(sInd, 1)
}
