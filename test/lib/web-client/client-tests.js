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


describe('web client', function() {

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
    afterEach(function() { config.usersLimit = 10 })

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

  describe('subscribe', function() {
    
    beforeEach(function(done) {
      client.config.reconnect = 0
      async.series([
        function(next) { wsServer.start(config, next) },
        function(next) { client.start(done) }
      ])
    })

    it('should receive messages from the specified address', function(done) {
      assert.equal(connections._nsTree.has('/place1'), false)
      
      var subscribed = function(err) {
        if (err) throw err
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

      client.subscribe('/place1', handler, subscribed)
    })

    it('should work when subscribing one after the other two handlers to the same address', function(done) {
      var subscribed1 = function() {
        client.subscribe('/place1', function(address, args) { messageReceived([2, address, args]) }, subscribed2)
      }

      var subscribed2 = function() {
        assert.equal(connections._nsTree.get('/place1').data.connections.length, 1)
        connections.send('/place1/bla', ['blabla', 'lolo'])
      }

      var messageReceived = helpers.waitForAnswers(2, function(received) {
        helpers.assertSameElements(received, [
          [1, '/place1/bla', ['blabla', 'lolo']],
          [2, '/place1/bla', ['blabla', 'lolo']]
        ])
        done()
      })

      client.subscribe('/place1', function(address, args) { messageReceived([1, address, args]) }, subscribed1)
    })

    it('should work when subscribing without waiting two handlers to the same address', function(done) {
      var subscribed = helpers.waitForAnswers(2, function() {
        assert.equal(connections._nsTree.get('/place1').data.connections.length, 1)
        connections.send('/place1/bla', [111, 222])
      })

      var messageReceived = helpers.waitForAnswers(2, function(received) {
        helpers.assertSameElements(received, [
          [1, '/place1/bla', [111, 222]],
          [2, '/place1/bla', [111, 222]]
        ])
        done()
      })

      client.subscribe('/place1', function(address, args) { messageReceived([1, address, args]) }, subscribed)
      client.subscribe('/place1', function(address, args) { messageReceived([2, address, args]) }, subscribed)
    })

    it('should receive all messages from subspaces', function(done) {
      var received = []

      var subscribed = function(err) {
        if (err) throw err
        connections.send('/a', [44])
        connections.send('/a/b', [55])
        connections.send('/', [66])
        connections.send('/c', [77])
        connections.send('/a/d', [88])
        connections.send('/a/', [99])
      }

      var handler = function(address, args) {
        received.push([args[0], address])
        assert.equal(args.length, 1)
        if (received.length === 4) {
          helpers.assertSameElements(
            received, 
            [[44, '/a'], [55, '/a/b'], [88, '/a/d'], [99, '/a']]
          )
          done()
        }
      }

      client.subscribe('/a', handler, subscribed)
    })

    it('should receive blobs', function(done) {
      var received = []

      var subscribed = function(err) {
        if (err) throw err
        connections.send('/a', [new Buffer('hahaha'), 1234, 'blabla'])
        connections.send('/a/b', [new Buffer('hello')])
        connections.send('/a', [5678, new Buffer('hihi'), 'prout', new Buffer('hoho')])
        connections.send('/a/', [new Buffer('huhu'), new Buffer('hyhy')])
      }

      var handler = function(address, args) {
        received.push([address, args])
        if (received.length === 4) {
          helpers.assertSameElements(received, [
            ['/a', [new Buffer('hahaha'), 1234, 'blabla']],
            ['/a/b', [new Buffer('hello')]],
            ['/a', [5678, new Buffer('hihi'), 'prout', new Buffer('hoho')]],
            ['/a', [new Buffer('huhu'), new Buffer('hyhy')]]
          ])
          done()
        }
      }

      client.subscribe('/a', handler, subscribed)
    })

    it('should throw an error if the address is not valid', function(done) {
      handler = function() {}
      client.start(function(err) {
        if (err) throw err
        assert.throws(function() { client.subscribe('bla', handler) })
        assert.throws(function() { client.subscribe('/sys', handler) })
        assert.throws(function() { client.subscribe('/sys/takeIt/', handler) })
        assert.throws(function() { client.subscribe('/broadcast/bla/', handler) })
        done()
      })
    })

    it('should throw an error if the client isn\'t started', function(done) {
      handler = function() {}
      client.stop(function(err) {
        if (err) throw err
        assert.throws(function() { client.subscribe('/bla', handler) })
        done()
      })
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
      assert.throws(function() { client.send('/sys/', ['mna']) })
      assert.throws(function() { client.send('/broadcast/', [123]) })
    })

  })

  describe('auto-reconnect', function() {

    beforeEach(function(done) {
      client.config.reconnect = 1 // Just so that reconnect is not null and therefore it is handled
      async.series([
        function(next) { wsServer.start(config, next) },
        function(next) { client.start(next) },
        function(next) { client.subscribe('/someAddr', function() {}, next) }
      ], done)
    })

    var assertConnected = function() {
      assert.equal(connections._nsTree.get('/someAddr').data.connections.length, 1)
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
      ], done)
    })

    it('should work as well when retrying several times', function(done) {
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
      ], done)
    })

  })

})
