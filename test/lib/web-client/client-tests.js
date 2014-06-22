var _ = require('underscore')
  , fs = require('fs')
  , async = require('async')
  , assert = require('assert')
  , wsServer = require('../../../lib/server/websockets')
  , connections = require('../../../lib/server/connections')
  , client = require('../../../lib/web-client/client')
  , shared = require('../../../lib/shared')
  , utils = require('../../../lib/server/core/utils')
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
    client.on('error', function() {}) // Just to avoid throwing
    done()
  })
  afterEach(function(done) {
    client.debug = function() {}
    helpers.afterEach(done)
  })

  describe('start', function() {
    
    beforeEach(function(done) {
      config.usersLimit = 1
      client.config.reconnect(0)
      wsServer.start(config, done)
    })
    afterEach(function() {
      config.usersLimit = 10
    })

    var assertConnected = function() {
      assert.equal(client.status(), 'started')
      assert.equal(wsServer.sockets().filter(function(s) {
        return s.upgradeReq.url !== '/?dummies'
      }).length, 1)
      assert.equal(client.userId, 0)
    }

    var assertDisconnected = function() {
      assert.equal(client.status(), 'stopped')
      assert.equal(client.userId, null)
    }

    it('should open a socket connection to the server', function(done) {
      var received
      client.on('connected', function() { received = 'connected' })
      assertDisconnected()

      client.start(function(err) {
        if (err) throw err
        assertConnected()
        assert.equal(received, 'connected')
        done()
      })
    })

    it('should return an error if the server is not responding', function(done) {
      assertDisconnected()
      async.series([
        function(next) { wsServer.stop(next) },
        function(next) { setTimeout(next, 50) },
        function(next) { client.start(next) }
      ], function(err) {
        assert.ok(err)
        assertDisconnected()
        done()
      })
    })

    it('should reject connection when server is full and queue is false', function(done) {
      var received
      client.on('server full', function() { received = 'server full' })
      client.config.queueIfFull(false)
      assertDisconnected()

      helpers.dummyWebClients(config.webPort, 1, function(err, sockets) {
        if (err) throw err
        assert.equal(wsServer.sockets()[0].readyState, WebSocket.OPEN)

        client.start(function(err) {
          assert.ok(err)
          assert.equal(received, 'server full')
          done()
        })

      })
    })

    it('should put the client on queue when server is full and queue is true', function(done) {
      client.config.queueIfFull(true)
      assertDisconnected()

      async.waterfall([

        helpers.dummyWebClients.bind(this, config.webPort, 1),

        function(sockets, next) {
          client.start()
          client.once('server full', function(err) { next(err, sockets) })
        },

        function(sockets, next) {
          assertDisconnected()
          sockets[0].close()
          client.once('connected', next)
        }

      ], function(err) {
        if (err) throw err
        assertConnected()
        done()
      })
    })

  })

  describe('message', function() {
    
    beforeEach(function(done) {
      client.config.reconnect(0)
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
        assert.equal(connections._nsTree.get('/place1').connections.length, 1)
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
        { ip: '127.0.0.1', appPort: 9005 },
        { ip: '127.0.0.1', appPort: 9010 }
      ]
      client.config.reconnect(0)
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
      connections.subscribe(dummyConns[0], '/')
      connections.subscribe(dummyConns[1], '/bla')

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
      connections.subscribe(dummyConns[0], '/bla/blob')
      connections.subscribe(dummyConns[0], '/blu/blob')
      connections.subscribe(dummyConns[1], '/')

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
      connections.subscribe(dummyConns[0], '/bla')
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
      config.usersLimit = 2
      async.series([
        function(next) { wsServer.start(config, next) },
        function(next) { client.start(next) }
      ], done)
    })

    afterEach(function() {
      config.usersLimit = 10
    })

    var assertConnected = function() {
      assert.ok(_.isNumber(client.userId))
      assert.equal(client.status(), 'started')
    }

    var assertDisconnected = function() {
      assert.equal(client.status(), 'stopped')
    }

    it('should reconnect', function(done) {
      client.config.reconnect(50)
      assertConnected()
      async.series([
        function(next) {
          client.once('connection lost', next)
          wsServer.sockets()[0].rhizome.close()
        },
        function(next) {
          assertDisconnected()
          client.once('reconnected', next)
        }
      ], function(err) {
        if (err) throw err
        assertConnected()
        assert.deepEqual(received, ['connection lost', 'reconnected'])
        done()
      })
    })

    it('should work as well when reconnecting several times', function(done) {
      client.config.reconnect(30)
      assertConnected()

      // Test that we don't bind handlers several times when reconnection happens.
      // For this we just listen to 'subscribe' acknowledgment and see that we got
      // the expected messages in the end
      var allMessages = []
      client.on('message', function(address, args) { allMessages.push([ address, args ]) })
      client.on('reconnected', function() { client.send(shared.subscribeAddress, ['/a']) })
      client.send(shared.subscribeAddress, ['/a'])

      async.series([
        // Wait for the 'subscribed' message before continuing
        function(next) { client.once('message', function() { next() }) },

        function(next) {
          wsServer.sockets()[0].rhizome.close()
          wsServer.stop()
          setTimeout(next, 250) // wait for a few retries
        },
        function(next) {
          assertDisconnected()
          wsServer.start(config, next)
        },
        function(next) { client.once('reconnected', next) },
        function(next) { client.once('message', function() { next() }) },

        function(next) {
          assertConnected()
          wsServer.stop() // do it again
          setTimeout(next, 250)
        },
        function(next) {
          assertDisconnected()
          wsServer.start(config, next)
        },
        function(next) { client.once('reconnected', next) }, // wait for reconnection to happen
        function(next) { client.once('message', function() { next() }) },
        function(next) {
          assertConnected()
          next()
        },

        function(next) {
          assertConnected()
          wsServer.stop() // do it again
          setTimeout(next, 250)
        },
        function(next) {
          assertDisconnected()
          wsServer.start(config, next)
        },
        function(next) { client.once('reconnected', next) }, // wait for reconnection to happen
        function(next) { client.once('message', function() { next() }) },
        function(next) {
          assertConnected()
          next()
        }

      ], function(err) {
        if (err) throw err
        assert.equal(allMessages.length, 4)
        assert.deepEqual(received, [
          'connection lost', 'reconnected',
          'connection lost', 'reconnected',
          'connection lost', 'reconnected'
        ]) 
        done()
      })
    })

    it('should work fine if the server is full when trying to reconnect', function(done) {
      var dummySockets
      client.config.reconnect(100)
      assertConnected()
      async.series([
        function(next) {
          wsServer.sockets()[0].rhizome.close()
          setTimeout(next, 10)
        },
        function(next) {
          helpers.dummyWebClients(config.webPort, 2, function(err, sockets) {
            dummySockets = sockets
            next()
          })
        },
        function(next) {
          assertDisconnected()
          client.once('server full', next)
        },
        function(next) {
          dummySockets[0].close()
          client.once('reconnected', next)
        },
        function(next) {
          assertConnected()
          wsServer.stop() // do it again
          setTimeout(next, 150)
        },
        function(next) {
          wsServer.start(config, next)
          assertDisconnected()
          helpers.dummyWebClients(config.webPort, 2, function(err, sockets) {
            dummySockets = sockets
            next()
          })
        },
        function(next) {
          client.once('server full', next)
        },
        function(next) {
          dummySockets[0].close()
          client.once('reconnected', next)
        }
      ], function(err) {
        if (err) throw err
        assertConnected()
        done()
      })
    })

  })

})
