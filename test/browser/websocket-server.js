#!/usr/bin/env node
/*
 * Copyright 2014-2015, Sébastien Piquemal <sebpiq@gmail.com>
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
var path = require('path')
  , fs = require('fs')
  , _ = require('underscore')
  , WebSocket = require('ws')
  , urlparse = require('url')
  , oscMin = require('osc-min')
  , async = require('async')
  , express = require('express')
  , morgan = require('morgan')
  , serveStatic = require('serve-static')
  , bodyParser = require('body-parser')
  , rimraf = require('rimraf')
  , websockets = require('../../lib/websockets')
  , connections = require('../../lib/connections')
  , helpers = require('../helpers-backend')


var packageRootPath = path.join(__dirname, '..', '..')
  , buildDir = path.join(packageRootPath, 'build')
  , app = express()
  , httpServer = require('http').createServer(app)
  , wsServer = new websockets.Server({ 
      maxSockets: 5,
      serverInstance: httpServer
    })
  , manager

exports.config = {
  port: parseInt(process.env.ZUUL_PORT, 10)
}

var getOpenClients = function() {
  return wsServer._wsServer.clients.filter(function(s) {
    return s.readyState === WebSocket.OPEN
  })
}

var getDummyWebClients = function() {
  return getOpenClients().filter(function(s) {
    var query = urlparse.parse(s.upgradeReq.url, true).query
    return query.hasOwnProperty('dummies')
  })
}

var getDummyClients = function() {
  return connections.manager._openConnections.filter(function(c) { 
    return c instanceof helpers.DummyConnection 
  })
}

var getWebClient = function() {
  var dummyClients = getDummyWebClients()
  return _.find(wsServer._wsServer.clients, function(s) {
    return s.readyState === WebSocket.OPEN && !_.contains(dummyClients, s)
  })
}

app.use(morgan('combined', { skip: function (req, res) { return res.statusCode < 400 } }))
app.use(bodyParser.raw())
app.use(bodyParser.json())
app.use('/rhizome', serveStatic(buildDir))

app.post('/server/start', function(req, res) {
  var config = req.body
    , store = config.store ? new connections.NEDBStore(config.store) : new connections.NoStore()
  connections.manager = new connections.ConnectionManager({ store: store })
  async.series([
    connections.manager.start.bind(connections.manager),
    wsServer.start.bind(wsServer)
  ], function(err) {
    if (err) throw err
    setTimeout(function() { res.end() }, 10)
  })
})

app.post('/server/stop', function(req, res) {
  var config = req.body
    , asyncOps = [
      wsServer.stop.bind(wsServer)
    ]
  
  if (connections.manager)
    asyncOps.push(connections.manager.stop.bind(connections.manager))
  
  // See https://github.com/websockets/ws/pull/605
  if (wsServer._wsServer) {
    wsServer._wsServer._server.removeAllListeners('upgrade')
    wsServer._wsServer._server.removeAllListeners('error')
    wsServer._wsServer._server.removeAllListeners('listening')
  }
  
  if (config.store) asyncOps.push(rimraf.bind(rimraf, config.store))
  
  async.series(asyncOps, function(err) {
    if (err) throw err
    setTimeout(function() { res.end() }, 10)
  })
})

app.get('/server/connected', function(req, res) {
  var allOpenClients = getOpenClients()
    , dummyWebClients = getDummyWebClients()
  res.json({ count: allOpenClients.length - dummyWebClients.length })
})

app.post('/server/fill-up', function(req, res) {
  var dummyClients = _.range(wsServer._config.maxSockets).map(function() { 
    return { port: exports.config.port }
  })
  helpers.dummyWebClients(wsServer, dummyClients, function(err, sockets) {
    if (err) throw err
    res.end()
  })
})

app.post('/server/kick-out', function(req, res) {
  var socket = getWebClient()
  if (socket) socket.close()
  res.end()
})

app.post('/server/free-up', function(req, res) {
  var socket = getDummyWebClients()[0]
  socket.once('close', function() {
    res.end()
  })
  socket.close()
})

app.post('/message/send', function(req, res) {
  var msg = oscMin.fromBuffer(req.body)
    , address = msg.address
    , args = _.pluck(msg.args, 'value')
  connections.manager.send(address, args)
  res.end()
})

app.post('/message/receive', function(req, res) {
  var addresses = req.body
    , connection = new helpers.DummyConnection(function(address, args) {
      this.received.push([address, args])
    })
  connection.received = []
  connection.id = Math.random().toString()
  connections.manager.open(connection, function(err) {
    if (err) throw err
    addresses.forEach(function(address) {
      connections.manager.subscribe(connection, address)
    })
    res.end()
  })
})

// Format [[<connection index>, <address>, <args>] ...]
app.get('/message/received', function(req, res) {
  res.json(getDummyClients().reduce(function(cum, c, i) { 
    return cum.concat(c.received.map(function(msg) { return [i].concat(msg) }))
  }, []))
})

app.get('/namespace/infos', function(req, res) {
  var address = req.query.address
  if (!connections.manager._nsTree.has(address)) {
    res.json([])
  } else {
    var nsNode = connections.manager._nsTree.get(address)
    res.json(nsNode.connections.map(function(c) { return c.infos }))
  }
})

exports.start = function(done) {
  async.parallel([
    function(next) { 
      httpServer.once('listening', next)
      httpServer.listen(exports.config.port)
    },
    websockets.renderClientBrowser.bind(websockets, buildDir),
  ], done)
}

exports.stop = function(done) {
  httpServer.close()
  httpServer.once('close', done)
}

if (require.main === module) {
  exports.start(function(err) {
    if (err) throw err
    console.log('websocket test server running')
  })
}