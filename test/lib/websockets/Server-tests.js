var _ = require('underscore')
  , fs = require('fs')
  , WebSocket = require('ws')
  , async = require('async')
  , assert = require('assert')
  , websockets = require('../../../lib/websockets')
  , connections = require('../../../lib/connections')
  , coreMessages = require('../../../lib/core/messages')
  , ValidationError = require('../../../lib/core/errors').ValidationError
  , helpers = require('../../helpers')

var config = {
  port: 8000,
  rootUrl: '/',
  usersLimit: 5
}

var wsServer = new websockets.Server(config)
helpers.wsServer = wsServer


describe('websockets.Server', function() {

  beforeEach(function(done) { wsServer.start(done) })
  afterEach(function(done) { helpers.afterEach([wsServer], done) })

  describe('start', function() {

    it('should return ValidationError if config is not valid', function(done) {
      helpers.assertConfigErrors([
        [new websockets.Server({}), ['.port']],
        [new websockets.Server({rootUrl: 12345}), ['.rootUrl', '.port']],
        [new websockets.Server({rootUrl: '/'}), ['.port']],
        [new websockets.Server({rootUrl: '/', port: 80, serverInstance: 34}), ['.serverInstance']],
        [new websockets.Server({rootUrl: '/', port: 90, usersLimit: 'bla'}), ['.usersLimit']],
        [new websockets.Server({rootUrl: '/', port: 90, wot: '???'}), ['.']]
      ], done)
    })

  })

  describe('connection', function() {

    it('should reject connection when full', function(done) {
      assert.equal(wsServer._wsServer.clients.length, 0)

      async.waterfall([

        function(next) {
          helpers.dummyWebClients(wsServer, config.port, 6, function(err, sockets) {
            if (err) return next(err)
            assert.deepEqual(
              _.pluck(wsServer._wsServer.clients.slice(0, 5), 'readyState'), 
              _.range(5).map(function() { return WebSocket.OPEN })
            )
            _.last(sockets).on('message', function(msg) { next(null, msg) })
          })
        }

      ], function(err, msg) {
        if (err) throw err
        msg = JSON.parse(msg)
        assert.ok(msg.error)
        delete msg.error
        assert.deepEqual(msg, {command: 'connect', status: 1})
        assert.equal(_.last(wsServer._wsServer.clients).readyState, WebSocket.CLOSING)
        done()
      })
    })

    it('should send a message to all other connections', function(done) {
      assert.equal(wsServer._wsServer.clients.length, 0)

      // Create dummy connection to listen to the 'open' message
      var dummyConnections = helpers.dummyConnections(6, 3, function(received) {
        var ids = received.map(function(r) { return r[2][0] })
        received.forEach(function(r) { r[2] = ['id'] })
        // Check ids
        ids.forEach(function(id) { assert.ok(_.isString(id) && id.length > 5) })
        // Check for unicity
        assert.equal(_.uniq(ids).length, 3)

        helpers.assertSameElements(received, [
          [0, coreMessages.connectionOpenAddress, ['id']],
          [0, coreMessages.connectionOpenAddress, ['id']],
          [0, coreMessages.connectionOpenAddress, ['id']],

          [2, coreMessages.connectionOpenAddress, ['id']],
          [2, coreMessages.connectionOpenAddress, ['id']],
          [2, coreMessages.connectionOpenAddress, ['id']]
        ])
        done()
      })
      connections.subscribe(dummyConnections[0], coreMessages.connectionOpenAddress)
      connections.subscribe(dummyConnections[2], coreMessages.connectionOpenAddress)

      // Create dummy web clients, so that new connections are open
      helpers.dummyWebClients(wsServer, config.port, 3)
    })

  })

  describe('disconnection', function() {

    it('should forget the sockets', function(done) {
      assert.equal(wsServer._wsServer.clients.length, 0)
      async.waterfall([
        function(next) { helpers.dummyWebClients(wsServer, config.port, 3, next) },
        function(sockets, next) {
          var connection1 = wsServer.connections[0]
            , connection2 = wsServer.connections[1]
          connections.subscribe(connection1, '/someAddr')
          connections.subscribe(connection2, '/someOtherAddr')
          assert.equal(connections._nsTree.get('/someAddr').connections.length, 1)
          assert.equal(connections._nsTree.get('/someOtherAddr').connections.length, 1)
          assert.equal(wsServer._wsServer.clients.length, 3)
          connection1.socket.close()
          connection1.on('close', function() { next() })
        }
      ], function(err) {
        if (err) throw err
        assert.equal(wsServer._wsServer.clients.length, 2)
        assert.equal(connections._nsTree.get('/someAddr').connections.length, 0)
        assert.equal(connections._nsTree.get('/someOtherAddr').connections.length, 1)
        done()
      })
    })

    it('should send a message to all other connections', function(done) {
      assert.equal(wsServer._wsServer.clients.length, 0)

      // Create dummy web clients, and immediately close one of them
      helpers.dummyWebClients(wsServer, config.port, 3, function(err, sockets) {
        if (err) throw err
        assert.equal(wsServer._wsServer.clients.length, 3)
        sockets[2].close()
      })

      // Create dummy connections to listen to the 'close' message
      var dummyConnections = helpers.dummyConnections(2, 3, function(received) {
        var ids = received.map(function(r) { return r[2][0] })
        received.forEach(function(r) { r[2] = ['id'] })
        // Check ids
        ids.forEach(function(id) { assert.ok(_.isString(id) && id.length > 5) })
        // Check for unicity
        assert.equal(_.uniq(ids).length, 1)

        helpers.assertSameElements(received, [
          [0, coreMessages.connectionCloseAddress, ['id']],
          [2, coreMessages.connectionCloseAddress, ['id']]
        ])
        done()
      })
      connections.subscribe(dummyConnections[0], coreMessages.connectionCloseAddress)
      connections.subscribe(dummyConnections[2], coreMessages.connectionCloseAddress)

    })

  })

  describe('send', function() {

    it('shouldn\'t crash if socket is not opened', function(done) {
      assert.equal(wsServer._wsServer.clients.length, 0)

      // Create dummy web clients, and immediately close one of them
      helpers.dummyWebClients(wsServer, config.port, 1, function(err, sockets) {
        if (err) throw err
        assert.equal(wsServer._wsServer.clients.length, 1)
        var serverSocket = wsServer._wsServer.clients[0]
        serverSocket.close()
        console.log('\nDO NOT PANIC : this is just a test (should say "web socket send failed")')
        wsServer.connections[0].send('/bla', [1, 2, 3])
        done()
      })

    })

  })

})
