var _ = require('underscore')
  , fs = require('fs')
  , WebSocket = require('ws')
  , async = require('async')
  , assert = require('assert')
  , wsServer = require('../../../lib/server/websockets')
  , connections = require('../../../lib/server/connections')
  , utils = require('../../../lib/server/core/utils')
  , shared = require('../../../lib/shared')
  , helpers = require('../../helpers')

var config = {

  webPort: 8000,
  oscPort: 9000, 
  rootUrl: '/',
  usersLimit: 5,

  clients: []
}


describe('websockets', function() {

  beforeEach(function(done) { wsServer.start(config, done) })
  afterEach(function(done) { helpers.afterEach(done) })

  describe('connection', function() {

    it('should reject connection when full', function(done) {
      assert.equal(wsServer.sockets().length, 0)

      async.waterfall([

        function(next) {
          helpers.dummyWebClients(config.webPort, 6, function(err, sockets) {
            if (err) return next(err)
            assert.deepEqual(
              _.pluck(wsServer.sockets().slice(0, 5), 'readyState'), 
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
        assert.equal(_.last(wsServer.sockets()).readyState, WebSocket.CLOSING)
        done()
      })
    })

    it('should send a message to all other connections', function(done) {
      assert.equal(wsServer.sockets().length, 0)

      // Create dummy connection to listen to the 'open' message
      var dummyConnections = helpers.dummyConnections(6, 3, function(received) {
        helpers.assertSameElements(received, [
          [0, shared.connectionOpenAddress, [0]],
          [0, shared.connectionOpenAddress, [1]],
          [0, shared.connectionOpenAddress, [2]],

          [2, shared.connectionOpenAddress, [0]],
          [2, shared.connectionOpenAddress, [1]],
          [2, shared.connectionOpenAddress, [2]]
        ])
        done()
      })
      connections.subscribe(dummyConnections[0], shared.connectionOpenAddress)
      connections.subscribe(dummyConnections[2], shared.connectionOpenAddress)

      // Create dummy web clients, so that new connections are open
      helpers.dummyWebClients(config.webPort, 3)
    })

  })

  describe('disconnection', function() {

    it('should forget the sockets', function(done) {
      assert.equal(wsServer.sockets().length, 0)
      async.waterfall([
        function(next) { helpers.dummyWebClients(config.webPort, 3, next) },
        function(sockets, next) {
          connections.subscribe(wsServer.sockets()[0].rhizome, '/someAddr')
          connections.subscribe(wsServer.sockets()[1].rhizome, '/someOtherAddr')
          assert.equal(connections._nsTree.get('/someAddr').connections.length, 1)
          assert.equal(connections._nsTree.get('/someOtherAddr').connections.length, 1)
          assert.equal(wsServer.sockets().length, 3)
          sockets[0].close()
          sockets[0].on('close', function() { next() })
        }
      ], function(err) {
        if (err) throw err
        assert.equal(wsServer.sockets().length, 2)
        assert.equal(connections._nsTree.get('/someAddr').connections.length, 0)
        assert.equal(connections._nsTree.get('/someOtherAddr').connections.length, 1)
        done()
      })
    })

    it('should send a message to all other connections', function(done) {
      assert.equal(wsServer.sockets().length, 0)

      // Create dummy web clients, and immediately close one of them
      helpers.dummyWebClients(config.webPort, 3, function(err, sockets) {
        if (err) throw err
        assert.equal(wsServer.sockets().length, 3)
        sockets[2].close()
      })

      // Create dummy connections to listen to the 'close' message
      var dummyConnections = helpers.dummyConnections(2, 3, function(received) {
        helpers.assertSameElements(received, [
          [0, shared.connectionCloseAddress, [2]],
          [2, shared.connectionCloseAddress, [2]]
        ])
        done()
      })
      connections.subscribe(dummyConnections[0], shared.connectionCloseAddress)
      connections.subscribe(dummyConnections[2], shared.connectionCloseAddress)

    })

  })

  describe('send', function() {

    it('shouldn\'t crash if socket is not opened', function(done) {
      assert.equal(wsServer.sockets().length, 0)

      // Create dummy web clients, and immediately close one of them
      helpers.dummyWebClients(config.webPort, 1, function(err, sockets) {
        if (err) throw err
        assert.equal(wsServer.sockets().length, 1)
        var serverSocket = wsServer.sockets()[0]
        serverSocket.close()
        console.log('DO NOT PANIC : this is just a test')
        serverSocket.rhizome.send('/bla', [1, 2, 3])
        done()
      })

    })

  })

  describe('renderClient', function() {

    it('should render the client js file to the given folder', function(done) {
      async.series([
        wsServer.renderClient.bind(wsServer, '/tmp'),
        fs.unlink.bind(fs, '/tmp/rhizome.js')
      ], done)
    })

    it('should return errors', function(done) {
      wsServer.renderClient('/forbidden', function(err) {
        assert.ok(err)
        assert.equal(err.code, 'EACCES')
        done()
      })
    })

  })

})
