"use strict";
var _ = require('underscore')
  , fs = require('fs')
  , WebSocket = require('ws')
  , oscMin = require('osc-min')
  , async = require('async')
  , assert = require('assert')
  , http = require('http')
  , websockets = require('../../../lib/websockets')
  , connections = require('../../../lib/connections')
  , coreMessages = require('../../../lib/core/messages')
  , ValidationError = require('../../../lib/core/errors').ValidationError
  , helpers = require('../../helpers-backend')

var config = {
  port: 8000,
  rootUrl: '/',
  maxSockets: 5
}

var wsServer = new websockets.Server(config)


describe('websockets.Server', () => {

  var manager = new connections.ConnectionManager({
    store: new connections.NoStore()
  })

  beforeEach((done) => helpers.beforeEach([ manager, wsServer ], done))
  afterEach((done) => {
    wsServer.removeAllListeners('error')
    helpers.afterEach([wsServer, manager], done)
  })

  var _connectSameId = function(done) {
    var results, id
    async.waterfall([

      // Create a first connection, let the server assign an id
      helpers.dummyWebClients.bind(this, wsServer, [{ port: config.port }]),

      // Create a second connection by using the same id as the first one
      (sockets, messages, next) => {
        results = [sockets, messages]
        id = messages[0][1]
        helpers.dummyWebClients(wsServer, [{ port: config.port, query: { id: id } }], next)
      }

    ], (err, sockets, messages) => {
      if (err) return done(err)

      // Check that we received the same id as for the first connection
      messages.forEach((msg) => {
        assert.equal(msg.length, 2)
        assert.equal(msg[0], 0)
        assert.equal(msg[1], id)
        assert.ok(_.isString(msg[1]) && msg[1].length > 3)
      })
      done(err, results[0].concat(sockets), results[1].concat(messages))
    })
  }

  describe('Server', () => {

    describe('start', () => {

      it('should return ValidationError if config is not valid', (done) => {
        helpers.assertConfigErrors([
          [new websockets.Server({}), ['.port']],
          [new websockets.Server({rootUrl: 12345}), ['.rootUrl', '.port']],
          [new websockets.Server({rootUrl: '/'}), ['.port']],
          [new websockets.Server({rootUrl: '/', port: 80, serverInstance: 34}), ['.serverInstance']],
          [new websockets.Server({rootUrl: '/', port: 90, maxSockets: 'bla'}), ['.maxSockets']],
          [new websockets.Server({rootUrl: '/', port: 90, wot: '???'}), ['.']]
        ], done)
      })

      it('should start properly even if `serverInstance` is already listening', (done) => {
        var httpServer = http.createServer()
          , wsServer = new websockets.Server({ serverInstance: httpServer })
        httpServer.listen(8888)
        async.series([
          httpServer.on.bind(httpServer, 'listening'),
          wsServer.start.bind(wsServer),
          // Test connection
          helpers.dummyWebClients.bind(helpers, wsServer, [{ port: 8888 }]),
          wsServer.stop.bind(wsServer)
        ], done)
      })

    })

    describe('stop', () => {

      it('should close all connections properly', (done) => {
        var wsClients = [
          { port: config.port },
          { port: config.port },
          { port: config.port }
        ], wsConnections

        async.series([
          helpers.dummyWebClients.bind(helpers, wsServer, wsClients),

          (next) => {
            assert.equal(manager._openConnections.length, 3)
            assert.equal(wsServer.connections.length, 3)
            wsConnections = wsServer.connections.slice(0)
            wsServer.stop(next)
          }

        ], (err) => {
          if (err) done(err)
          assert.equal(manager._openConnections.length, 0)
          assert.equal(wsServer.connections.length, 0)
          assert.equal(wsConnections.length, 3)
          wsConnections.forEach((connection) => {
            connection._sockets.forEach((socket) => assert.equal(socket.readyState, WebSocket.CLOSED))
          })
          done()
        })
      })

    })

    describe('connection', () => {

      it('should reject socket when maxSockets reached', (done) => {
        var dummyClients = [
          { port: config.port },
          { port: config.port, query: { id: 'bla' } },
          { port: config.port },
          { port: config.port },
          { port: config.port, query: { id: 'bla' } },
          { port: config.port, query: { id: 'bla' } },
        ]
        assert.equal(wsServer._wsServer.clients.size, 0)

        helpers.dummyWebClients(wsServer, dummyClients, (err, sockets, messages) => {
          if (err) throw err

          assert.deepEqual(
            _.pluck(Array.from(wsServer._wsServer.clients).slice(0, 5), 'readyState'), 
            _.range(5).map(() => WebSocket.OPEN)
          )

          // Check that the last socket received connection rejected
          var lastMsg = messages.pop()
          assert.equal(lastMsg.length, 2)
          assert.equal(lastMsg[0], 1)
          assert.ok(_.isString(lastMsg[1]))
          assert.equal(_.last(Array.from(wsServer._wsServer.clients)).readyState, WebSocket.CLOSING)
          
          // Check that all sockets before got connection accepted
          messages.forEach((msg) => {
            assert.equal(msg.length, 2)
            assert.equal(msg[0], 0)
            assert.ok(_.isString(msg[1]))
          })
          done()
        })
      })

      it('shouldnt open several connections if sockets connect with same id', (done) => {
        var received = []

        // Check that all sockets got connection accepted and id set right

        assert.equal(wsServer._wsServer.clients.size, 0)
        assert.equal(wsServer.connections.length, 0)
        wsServer.on('connection', () => received.push('connection'))

        _connectSameId((err, sockets, messages) => {
          if (err) return done(err)

          // Check that we indeed have 2 sockets but only 1 actual connection
          assert.deepEqual(received, ['connection'])
          assert.equal(wsServer._wsServer.clients.size, 2)
          assert.equal(wsServer.connections.length, 1)
          assert.equal(wsServer.connections[0]._sockets.length, 2)

          // Clean-up
          wsServer.removeAllListeners('connection')
          done()
        })
      })

    })

    describe('disconnection', () => {

      it('should close the connection and clean when all sockets are closed', (done) => {
        var dummyClients = [ { port: config.port }, { port: config.port }, { port: config.port }]
          , connection1, connection2
        assert.equal(wsServer._wsServer.clients.size, 0)

        async.waterfall([
          helpers.dummyWebClients.bind(helpers, wsServer, dummyClients),

          (sockets, messages, next) => {
            connection1 = wsServer.connections[0]
            connection2 = wsServer.connections[1]
            assert.equal(wsServer.connections.length, 3)
            assert.equal(wsServer._wsServer.clients.size, 3)
            assert.equal(connection1._sockets.length, 1)

            // Subscribe the connections to different addresses
            manager.subscribe(connection1, '/someAddr')
            manager.subscribe(connection2, '/someOtherAddr')
            assert.equal(manager._nsTree.get('/someAddr').connections.length, 1)
            assert.equal(manager._nsTree.get('/someOtherAddr').connections.length, 1)

            // Close the only socket for that connection
            connection1._sockets[0].close()
            connection1.on('close', () => next())
          }
        ], (err) => {
          if (err) throw err
          // Check that everything has been cleaned properly
          assert.equal(wsServer.connections.length, 2)
          assert.equal(wsServer._wsServer.clients.size, 2)
          assert.equal(manager._nsTree.get('/someAddr').connections.length, 0)
          assert.equal(manager._nsTree.get('/someOtherAddr').connections.length, 1)
          done()
        })
      })

      it('should close all sockets when connection.close is called', (done) => {
        var connection
        assert.equal(wsServer._wsServer.clients.size, 0)
        assert.equal(wsServer.connections.length, 0)

        async.waterfall([
          _connectSameId,

          (sockets, messages, next) => {
            assert.equal(wsServer._wsServer.clients.size, 2)
            assert.equal(wsServer.connections.length, 1)
            assert.equal(wsServer.connections[0]._sockets.length, 2)
            connection = wsServer.connections[0]
            connection.close()
            setTimeout(() => next(), 50)
          }
        ], (err) => {
          if (err) throw err
          connection._sockets.forEach((socket) => assert.equal(socket.readyState, WebSocket.CLOSED))
          done()
        })

      })

      it('should keep the connection open if it still has active sockets', (done) => {
        var received = [], connection1
        assert.equal(wsServer._wsServer.clients.size, 0)

        async.waterfall([
          _connectSameId,

          (sockets, messages, next) => {
            connection1 = wsServer.connections[0]
            connection1.on('close', () => received.push('close'))
            assert.equal(wsServer.connections.length, 1)
            assert.equal(wsServer._wsServer.clients.size, 2)
            assert.equal(connection1._sockets.length, 2)

            // Subscribe the connections to different addresses
            manager.subscribe(connection1, '/someAddr')
            assert.equal(manager._nsTree.get('/someAddr').connections.length, 1)

            // Close one socket for that connection
            connection1._sockets[0].on('close', () => next())
            connection1._sockets[0].close()
          }

        ], (err) => {
          if (err) throw err
          // Check that everything has been cleaned properly, and connection is still open
          assert.equal(wsServer.connections.length, 1)
          assert.equal(connection1.status, 'open')
          assert.deepEqual(received, [])
          assert.equal(wsServer._wsServer.clients.size, 1)
          assert.equal(manager._nsTree.get('/someAddr').connections.length, 1)
          done()
        })
      })

    })

  })


  describe('Connection', () => {

    describe('send', () => {

      before(() => {
        WebSocket._Server = WebSocket.Server
      })

      // Restore original WebSocket.Server
      afterEach(() => {
        WebSocket.Server = WebSocket._Server
      })

      it('should bubble-up socket error when socket is not opened', (done) => {
        console.log('\nDO NOT PANIC : this is just a test (should say "web socket send failed")')
        wsServer.on('error', (err) => console.error(err.message))
        assert.equal(wsServer._wsServer.clients.size, 0)

        // Create dummy web clients, and immediately close one of them
        helpers.dummyWebClients(wsServer, [ { port: config.port } ], (err, sockets) => {
          if (err) throw err
          assert.equal(wsServer._wsServer.clients.size, 1)
          var serverSocket = Array.from(wsServer._wsServer.clients)[0]
          serverSocket.close()
          wsServer.connections[0].send('/bla', [1, 2, 3])
          done()
        })

      })

      it('should bubble-up error when socket closed right before connection status message sent ', (done) => {
        console.log('\nDO NOT PANIC : this is just a test (should say "web socket send failed")')

        // We override node-ws Server so that every new connection will be immediatelly closed.
        // This will cause the rhizome `websockets.Server` to try sending connection status messages
        // on a closed socket.
        var _WSServer = function(opts) {
          var wsServer = new WebSocket._Server(opts) 
          wsServer.on('connection', (socket) => socket.close())
          return wsServer
        }
        WebSocket.Server = _WSServer

        var closingWsServer = new websockets.Server(config)
        closingWsServer.on('error', (err) => console.error(err.message))

        async.series([
          // Close automatically started server to avoid using same port
          wsServer.stop.bind(wsServer),
          closingWsServer.start.bind(closingWsServer),
          // Since WebSockets are closed immediatelly, dummyWebClients 
          // won't manage to connect properly, so we call a timeout to go to next.
          (next) => {
            helpers.dummyWebClients(closingWsServer, [ { port: config.port } ], next)
            setTimeout(next, 100)
          },
          closingWsServer.stop.bind(closingWsServer),

        ], (err) => {
          if (err) throw err
          done()
        })
      })

      it('should send to all sockets associated to one connection', (done) => {
        assert.equal(wsServer._wsServer.clients.size, 0)

        async.waterfall([
          _connectSameId,

          (sockets, messages, next) => {
            assert.equal(wsServer.connections.length, 1)
            assert.equal(wsServer._wsServer.clients.size, 2)

            var onMessage = helpers.waitForAnswers(2, (received) => next(null, received))
            sockets.forEach((socket, i) => socket.on('message', onMessage))
            wsServer.connections[0].send('/bla', [1, 2, 3])
          }

        ], (err, received) => {
          if (err) return done(err)
          assert.equal(received.length, 2)
          received.forEach((args) => {
            var message = oscMin.fromBuffer(args[0])
              , address = message.address, args = _.pluck(message.args, 'value')
            assert.equal(address, '/bla')
            assert.deepEqual(args, [1, 2, 3])
          })
          done()
        })

      })


    })

    describe('onMessage', () => {

      it('should transmit to connection manager if message is a string or a buffer', (done) => {
        var strMsg = (oscMin.toBuffer({ address: '/imastr', args: [ 0, 56, 'bla', 23 ] })).toString('binary')
          , bufMsg = oscMin.toBuffer({ address: '/imabuf', args: ['ploplo'] })
          , received = []
          , dummyServer = new helpers.DummyServer

        assert.equal(wsServer._wsServer.clients.size, 0)
        async.series([
          helpers.dummyWebClients.bind(helpers, wsServer, [ { port: config.port } ]),
          dummyServer.openConnection.bind(dummyServer, [ (address, args) => received.push([address, args]), 'dummy1' ])
        
        ], (err, results) => {
          var dummyConnection = results.pop()
          manager.subscribe(dummyConnection, '/imastr')
          manager.subscribe(dummyConnection, '/imabuf')

          wsServer.connections[0]._onMessage(strMsg)
          assert.deepEqual(received, [['/imastr', [0, 56, 'bla', 23]]])

          wsServer.connections[0]._onMessage(bufMsg)
          assert.deepEqual(received, [['/imastr', [0, 56, 'bla', 23]], ['/imabuf', ['ploplo']]])
          done()
        })
      })

      it('should bubble-up error if message couldnt be decoded', (done) => {
        console.log('\nDO NOT PANIC : this is just a test (should say "invalid websocket message")')
        wsServer.on('error', (err) => console.error(err.message))

        assert.equal(wsServer._wsServer.clients.size, 0)
        helpers.dummyWebClients(wsServer, [ { port: config.port } ], (err, sockets, messages) => {
          if (err) throw err
          wsServer.connections[0]._onMessage(null)
          done()
        })
      })

    })

  })

})
