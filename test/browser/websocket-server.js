#!/usr/bin/env node
"use strict";
var path = require('path')
  , fs = require('fs')
  , EventEmitter = require('events').EventEmitter
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
  , browserify = require('browserify')
  , websockets = require('../../lib/websockets')
  , connections = require('../../lib/connections')
  , helpers = require('../helpers-backend')


var packageRootPath = path.join(__dirname, '..', '..')
  , buildDir = path.join(packageRootPath, 'build')


var Server = module.exports = function(config) {
  _.defaults(config, { port: 8000 })
  this.config = config
  this.emitter = new EventEmitter
}

_.extend(Server.prototype, {

  start: function(done) {
    var app = express()
      , httpServer = require('http').createServer(app)
      , wsServer = new websockets.Server({ 
          maxSockets: 5,
          serverInstance: httpServer
        })
      , dummyServer

    this.httpServer = httpServer

    var getOpenClients = () => {
      return Array.from(wsServer._wsServer.clients)
        .filter((s) => s.readyState === WebSocket.OPEN)
    }

    var getDummyWebClients = () => {
      return getOpenClients().filter((s) => {
        var query = urlparse.parse(s.upgradeReq.url, true).query
        return query.dummies !== undefined
      })
    }

    var getDummyClients = () => {
      return connections.manager._openConnections.filter((c) => { 
        return c instanceof helpers.DummyConnection 
      })
    }

    var getWebClient = () => {
      var dummyClients = getDummyWebClients()
      return _.find(Array.from(wsServer._wsServer.clients), (s) => {
        return s.readyState === WebSocket.OPEN && !_.contains(dummyClients, s)
      })
    }

    app.use(bodyParser.raw())
    app.use(bodyParser.json())
    app.use(bodyParser.text())
    app.use('/rhizome', serveStatic(buildDir))
    app.use('/', serveStatic(__dirname))

    // AJAX API for testing
    //----------------------

    // Start the websocket server and the connection manager (with or without persistence).
    app.post('/server/start', (req, res) => {
      var config = req.body
        , store = config.store ? new connections.NEDBStore(config.store) : new connections.NoStore()
      dummyServer = new helpers.DummyServer()

      connections.manager = new connections.ConnectionManager({ store: store })
      async.series([
        connections.manager.start.bind(connections.manager),
        wsServer.start.bind(wsServer)
      ], (err) => {
        if (err) throw err
        setTimeout(() => res.end(), 10)
      })
    })

    // Stop the server and the connection manager, erase persisted info
    app.post('/server/stop', (req, res) => {
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
      
      async.series(asyncOps, (err) => {
        if (err) throw err
        setTimeout(() => res.end(), 10)
      })
    })

    // Returns the count of connected web clients
    app.get('/server/connected', (req, res) => {
      var allOpenClients = getOpenClients()
        , dummyWebClients = getDummyWebClients()
      res.json({ count: allOpenClients.length - dummyWebClients.length })
    })

    // Fill-up the server with web clients so that it is full
    app.post('/server/fill-up', (req, res) => {
      var dummyClients = _.range(wsServer._config.maxSockets).map(() => { 
        return { port: this.config.port }
      })
      helpers.dummyWebClients(wsServer, dummyClients, (err, sockets) => {
        if (err) throw err
        res.end()
      })
    })

    // Kick-out the connected rhizome client (to simulate connection drop)
    app.post('/server/kick-out', (req, res) => {
      var socket = getWebClient()
      if (socket) socket.close()
      res.end()
    })

    // Make space on the server by removing some dummy clients
    app.post('/server/free-up', (req, res) => {
      var socket = getDummyWebClients()[0]
      if (!socket) throw new Error('no dummy socket was found')
      socket.once('close', () => res.end())
      socket.close()
    })

    // Simulate another client sending a message to rhizome server
    app.post('/message/send', (req, res) => {
      var msg = oscMin.fromBuffer(new Buffer(req.body, 'binary'))
        , address = msg.address
        , args = _.pluck(msg.args, 'value')
      connections.manager.send(address, args)
      res.end()
    })

    // Create a dummy connection subscribed at the given addresses
    app.post('/message/receive', (req, res) => {
      var addresses = req.body

      dummyServer.openConnection([
        // Message callback
        function(address, args) { this.received.push([address, args]) },
        // Connection id
        Math.random().toString()

      ], (err, connection) => {
        if (err) throw err
        connection.received = []
        addresses.forEach((address) => connections.manager.subscribe(connection, address))
        res.end()
      })
    })

    // Returns the messages received by the dummy connections
    // Format of returned data [[<connection index>, <address>, <args>] ...]
    app.get('/message/received', (req, res) => {
      res.json(getDummyClients().reduce((cum, c, i) => { 
        return cum.concat(c.received.map((msg) => [i].concat(msg)))
      }, []))
    })

    // Returns the infos of the given namespace
    app.get('/namespace/infos', (req, res) => {
      var address = req.query.address
      if (!connections.manager._nsTree.has(address)) {
        res.json([])
      } else {
        var nsNode = connections.manager._nsTree.get(address)
        res.json(nsNode.connections.map((c) => c.infos))
      }
    })

    // The mocha reporter running in the browser sends test results there
    // { failures: <failure count>, passes: <passed count>  }
    app.post('/tests/report', (req, res) => {
      this.emitter.emit('tests/report', req.body)
      res.end()
    })


    // Starting everything
    //----------------------

    async.parallel([
      (next) => { 
        httpServer.once('listening', next)
        httpServer.listen(this.config.port)
      },
      
      // Rendering the rhizome browser client
      websockets.renderClientBrowser.bind(websockets, buildDir),
      
      // Rendering the client test suite
      (next) => {
        var b = browserify()
          , destStream = fs.createWriteStream(path.join(buildDir, 'Client-tests.js'))
        b.add(path.resolve(__dirname, '..', 'lib', 'websockets', 'Client-tests.js'))
        b.exclude(path.join(__dirname, 'websocket-server.js'))
        b.ignore('ws')
        b.bundle().pipe(destStream)
        destStream.on('finish', next)
      }

    ], done)
  },

  stop: function(done) {
    this.httpServer.close()
    this.httpServer.once('close', done)
  }

})

if (require.main === module) {
  var server = new Server({})
  server.start((err) => {
    if (err) throw err
    console.log('open http://localhost:' + server.config.port + ' to run browser tests')
  })
}