var _ = require('underscore')
  , fs = require('fs')
  , async = require('async')
  , assert = require('assert')
  , wsServer = require('../../../lib/server/websockets')
  , connections = require('../../../lib/server/connections')
  , client = require('../../../lib/web-client/client')
  , shared = require('../../../lib/shared')
  , utils = require('../../../lib/server/utils')
  , helpers = require('../../helpers')
  , WebSocket = require('ws')

var config = {
  ip: '127.0.0.1',
  webPort: 8000,
  oscPort: 9000,
  rootUrl: '/',
  usersLimit: 40,
  blobsDirName: '/tmp',

  clients: []
}


describe('web-client.client', function() {

  beforeEach(function(done) {
    //client.debug = console.log
    done()
  })
  afterEach(function(done) {
    client.debug = function() {}
    helpers.afterEach(done)
  })

  describe('start', function() {
    
    beforeEach(function(done) {
      config.usersLimit = 1
      client.config.reconnect = 0
      wsServer.start(config, done)
    })
    afterEach(function() {
      config.usersLimit = 10
    })

    it('should open a socket connection to the server', function(done) {
      assert.equal(client.status(), 'stopped')
      assert.equal(client.userId, null)
      assert.equal(wsServer.sockets().length, 0)
      client.start(function(err) {
        if (err) throw err
        assert.equal(client.status(), 'started')
        assert.equal(wsServer.sockets().length, 1)
        assert.equal(client.userId, 0)
        done()
      })
    })

    it('should return an error if the server is not responding', function(done) {
      assert.equal(client.status(), 'stopped')
      assert.equal(wsServer.sockets().length, 0)
      assert.equal(client.userId, null)
      async.series([
        function(next) { wsServer.stop(next) },
        function(next) { setTimeout(next, 50) },
        function(next) { client.start(next) }
      ], function(err) {
        assert.ok(err)
        assert.equal(client.status(), 'stopped')
        assert.equal(client.userId, null)
        done()
      })
    })

  })

  describe('message', function() {
    
    beforeEach(function(done) {
      client.config.reconnect = 0
      async.series([
        function(next) { wsServer.start(config, next) },
        function(next) { client.start(done) }
      ])
    })

    it('should receive messages from the specified address', function(done) {
      assert.equal(connections._nsTree.has('/place1'), false)

      var subscribed = function(address, args) {
        assert.equal(address, shared.subscribedAddress)
        assert.deepEqual(args, ['/place1'])
        assert.equal(connections._nsTree.has('/place1'), true)
        assert.equal(connections._nsTree.get('/place1').data.connections.length, 1)
        connections.send('/place2', [44])
        connections.send('/place1', [1, 2, 3])
      }

      var handler = function(address, args) {
        assert.equal(address, '/place1')
        assert.deepEqual(args, [1, 2, 3])
        done()        
      }

      client.once('message', function(address, args) {
        client.on('message', handler)
        subscribed(address, args)
      })
      client.send(shared.subscribeAddress, ['/place1'])
    })

    it('should receive blobs', function(done) {

      var subscribed = function(address, args) {
        assert.equal(address, shared.subscribedAddress)
        assert.deepEqual(args, ['/a'])
        connections.send('/a', [new Buffer('hahaha'), 1234, 'blabla'])
        connections.send('/a/b', [new Buffer('hello')])
        connections.send('/a', [5678, new Buffer('hihi'), 'prout', new Buffer('hoho')])
        connections.send('/a/', [new Buffer('huhu'), new Buffer('hyhy')])
      }

      var handler = function(received) {
        helpers.assertSameElements(received, [
          ['/a', [new Buffer('hahaha'), 1234, 'blabla']],
          ['/a/b', [new Buffer('hello')]],
          ['/a', [5678, new Buffer('hihi'), 'prout', new Buffer('hoho')]],
          ['/a', [new Buffer('huhu'), new Buffer('hyhy')]]
        ])
        done()
      }

      client.once('message', function(address, args) {
        client.on('message', helpers.waitForAnswers(4, handler))
        subscribed(address, args)
      })
      client.send(shared.subscribeAddress, ['/a'])
    })

  })

  describe('send', function() {
    
    beforeEach(function(done) {
      config.clients = [
        { ip: '127.0.0.1', appPort: 9005, blobClientPort: 44444 },
        { ip: '127.0.0.1', appPort: 9010, blobClientPort: 44445 }
      ]
      client.config.reconnect = 0
      async.series([
        function(next) { wsServer.start(config, next) },
        function(next) { client.start(done) }
      ], done)
    })

    it('should send messages to the specified address', function(done) {
      // Creating dummy connections
      var dummyConns = helpers.dummyConnections(3, 2, function(received) {
        helpers.assertSameElements(received, [
          [0, '/bla', [1, 2, 3]],
          [0, '/blo', ['oui', 'non']],
          [1, '/bla', [1, 2, 3]]
        ])
        done()
      })

      // Subscribing them to receive what's sent by our client
      connections.subscribe('/', dummyConns[0])
      connections.subscribe('/bla', dummyConns[1])

      // Sending messages
      client.send('/bla', [1, 2, 3])
      client.send('/blo', ['oui', 'non'])
    })

    it('should handle things correctly when sending blobs', function(done) {
      // Creating dummy connections
      var dummyConns = helpers.dummyConnections(6, 2, function(received) {
        helpers.assertSameElements(received, [
          [0, '/bla/blob', [1, new Buffer('blobba'), 'blabla']],
          [0, '/blu/blob', [new Buffer('blobbu'), 'hoho', 5678]],

          [1, '/bla/blob', [1, new Buffer('blobba'), 'blabla']],
          [1, '/blo/blob', [new Buffer('blobbo1'), 1234, new Buffer('blobbo2')]],
          [1, '/blu/blob', [new Buffer('blobbu'), 'hoho', 5678]],
          [1, '/bli/blob', [new Buffer('blobbi')]],
        ])
        done()
      })

      // Subscribing them to receive what's sent by our client
      connections.subscribe('/bla/blob', dummyConns[0])
      connections.subscribe('/blu/blob', dummyConns[0])
      connections.subscribe('/', dummyConns[1])

      // Sending messages containing blobs
      client.send('/bla/blob', [1, new Buffer('blobba'), 'blabla'])
      client.send('/blo/blob', [new Buffer('blobbo1'), 1234, new Buffer('blobbo2')])
      client.send('/blu/blob/', [new Buffer('blobbu'), 'hoho', 5678])
      client.send('/bli/blob/', [new Buffer('blobbi')])
    })

    it('should work when sending no arguments', function(done) {
      var dummyConns = helpers.dummyConnections(1, 1, function(received) {
        helpers.assertSameElements(received, [[0, '/bla', []]])
        done()
      })
      connections.subscribe('/bla', dummyConns[0])
      client.send('/bla/')
    })

    it('should throw an error if the address is not valid', function() {
      assert.throws(function() { client.send('bla', [12]) })
      assert.throws(function() { client.send('/broadcast/', [123]) })
    })

    it('should throw an error if the args are not valid', function() {
      assert.throws(function() { client.send('/hello', {}) })
      assert.throws(function() { client.send('/hello', ['mna', null]) })
    })

  })

  describe('auto-reconnect', function() {

    var received = []

    beforeEach(function(done) {
      client.on('connection lost', function() { received.push('connection lost') })
      client.on('reconnected', function() { received.push('reconnected') })
      received = []
      client.config.reconnect = 1 // Just so that reconnect is not null and therefore it is handled
      async.series([
        function(next) { wsServer.start(config, next) },
        function(next) { client.start(next) }
      ], done)
    })

    var assertConnected = function() {
      assert.ok(_.isNumber(client.userId))
      assert.equal(client.status(), 'started')
    }

    var assertDisconnected = function() {
      assert.equal(client.status(), 'stopped')
    }

    it('should reconnect', function(done) {
      client.config.reconnect = 50
      assertConnected()
      async.series([
        function(next) {
          wsServer.sockets()[0].rhizome.close()
          setTimeout(next, 20)
        },
        function(next) {
          assertDisconnected()
          setTimeout(next, 100)
        },
        function(next) {
          assertConnected()
          next()
        }
      ], function(err) {
        if (err) throw err
        assert.deepEqual(received, ['connection lost', 'reconnected'])
        done()
      })
    })

    it('should work as well when reconnecting several times', function(done) {
      client.config.reconnect = 30
      assertConnected()
      async.series([
        function(next) {
          wsServer.sockets()[0].rhizome.close()
          wsServer.stop()
          setTimeout(next, 150) // wait for a few retries
        },
        function(next) {
          assertDisconnected()
          wsServer.start(config, next)
        },
        function(next) { setTimeout(next, 80) }, // wait for reconnection to happen
        function(next) {
          assertConnected()
          wsServer.stop() // do it again
          setTimeout(next, 150)
        },

        function(next) {
          assertDisconnected()
          wsServer.start(config, next)
        },
        function(next) { setTimeout(next, 80) }, // wait for reconnection to happen
        function(next) {
          assertConnected()
          next()
        }
      ], function(err) {
        if (err) throw err
        assert.deepEqual(received, ['connection lost', 'reconnected', 'connection lost', 'reconnected']) 
        done()
      })
    })

  })

})
