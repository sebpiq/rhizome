var _ = require('underscore')
  , fs = require('fs')
  , WebSocket = require('ws')
  , async = require('async')
  , assert = require('assert')
  , wsServer = require('../../../lib/server/websockets')
  , connections = require('../../../lib/server/connections')
  , utils = require('../../../lib/server/utils')
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
      helpers.dummyWebClients(config.webPort, 6, function(err, sockets) {
        if (err) throw err
        assert.deepEqual(
          _.pluck(wsServer.sockets().slice(0, 5), 'readyState'), 
          _.range(5).map(function() { return WebSocket.OPEN })
        )
        assert.equal(_.last(wsServer.sockets()).readyState, WebSocket.CLOSING)
        _.last(sockets).on('message', function(msg) {
          msg = JSON.parse(msg)
          assert.ok(msg.error)
          delete msg.error
          assert.deepEqual(msg, {command: 'connect', status: 1})
          done()
        })
      })
    })

  })

  describe('disconnection', function() {

    it('should forget the sockets', function(done) {
      assert.equal(wsServer.sockets().length, 0)
      async.waterfall([
        function(next) { helpers.dummyWebClients(config.webPort, 3, next) },
        function(sockets, next) {
          connections.subscribe('/someAddr', wsServer.sockets()[0].rhizome)
          connections.subscribe('/someOtherAddr', wsServer.sockets()[1].rhizome)
          assert.equal(connections._nsTree.get('/someAddr').data.connections.length, 1)
          assert.equal(connections._nsTree.get('/someOtherAddr').data.connections.length, 1)
          assert.equal(wsServer.sockets().length, 3)
          sockets[0].close()
          sockets[0].on('close', function() { next() })
        }
      ], function(err) {
        if (err) throw err
        assert.equal(wsServer.sockets().length, 2)
        assert.equal(connections._nsTree.get('/someAddr').data.connections.length, 0)
        assert.equal(connections._nsTree.get('/someOtherAddr').data.connections.length, 1)
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
        assert.deepEqual(received, [
          [0, shared.closeAddress, [2]],
          [2, shared.closeAddress, [2]]
        ])
        done()
      })
      connections.subscribe(shared.closeAddress, dummyConnections[0])
      connections.subscribe(shared.closeAddress, dummyConnections[2])

    })

  })

})
