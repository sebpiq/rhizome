var _ = require('underscore')
  , fs = require('fs')
  , async = require('async')
  , assert = require('assert')
  , WebSocket = require('ws')
  , websockets = require('../../../lib/websockets')
  , connections = require('../../../lib/connections')
  , coreMessages = require('../../../lib/core/messages')
  , helpers = require('../../helpers')

var serverConfig = {
  port: 8000,
  rootUrl: '/',
  usersLimit: 2
}

var client, clientConfig = {
  port: 8000,
  hostname: 'localhost',
  reconnect: 0,
  queueIfFull: true
}

var wsServer = new websockets.Server(serverConfig)


describe('websockets.Client', function() {

  beforeEach(function(done) {
    //client.debug = console.log
    client.on('error', function() {}) // Just to avoid throwing
    done()
  })

  afterEach(function(done) {
    client.debug = function() {}
    client.removeAllListeners()
    helpers.afterEach([wsServer, client], done)
  })

  describe('start', function() {
    client = new websockets.Client(clientConfig)

    beforeEach(function(done) {
      wsServer.start(done)
    })

    var assertConnected = function(otherClient) {
      var c = client || otherClient
      assert.equal(c.status(), 'started')
      assert.equal(wsServer.sockets().filter(function(s) {
        return s.upgradeReq.url !== '/?dummies'
      }).length, 1)
      assert.ok(_.isString(c.id) && c.id.length > 5)
    }

    var assertDisconnected = function(otherClient) {
      var c = client || otherClient
      assert.equal(c.status(), 'stopped')
      assert.equal(c.id, null)
    }

    it('should return ValidationError if config is not valid', function(done) {
      helpers.assertConfigErrors([
        [new websockets.Client({}), ['.hostname', '.port']],
        [new websockets.Client({hostname: 'localhost', port: 8000, queueIfFull: 7}), ['.queueIfFull']]
      ], done)
    })

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
        , clientNoQueue = new websockets.Client(_.extend({}, clientConfig, { queueIfFull: false }))
      assertDisconnected(clientNoQueue)

      async.waterfall([
        helpers.dummyWebClients.bind(helpers, wsServer, serverConfig.port, 2),
        function(sockets, next) {
          assert.equal(wsServer.sockets()[0].readyState, WebSocket.OPEN)
          clientNoQueue.start(next)
        }
      ], function(err, next) {
        assert.ok(err)
        clientNoQueue.stop(done)
      })
    })

    it('should put the client on queue when server is full and queue is true', function(done) {
      assertDisconnected()

      async.waterfall([

        helpers.dummyWebClients.bind(this, wsServer, serverConfig.port, 2),

        function(sockets, next) {
          client.start(function(err) { if (err) throw err })
          client.once('queued', function(err) { next(err, sockets) })
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

  describe('stop', function() {
    client = new websockets.Client(clientConfig)

    it('should call the callback even if client is already stopped', function(done) {
      client.stop(done)
    })

  })

  describe('message', function() {
    client = new websockets.Client(clientConfig)

    beforeEach(function(done) {
      async.series([
        function(next) { wsServer.start(next) },
        function(next) { client.start(done) }
      ])
    })

    it('should receive messages from the specified address', function(done) {
      assert.equal(connections._nsTree.has('/place1'), false)

      var subscribed = function(address, args) {
        assert.equal(address, coreMessages.subscribedAddress)
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
      client.send(coreMessages.subscribeAddress, ['/place1'])
    })

    it('should receive blobs', function(done) {

      var subscribed = function(address, args) {
        assert.equal(address, coreMessages.subscribedAddress)
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
      client.send(coreMessages.subscribeAddress, ['/a'])
    })

  })

  describe('send', function() {
    client = new websockets.Client(clientConfig)

    beforeEach(function(done) {
      async.series([
        function(next) { wsServer.start(next) },
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
    client = new websockets.Client(_.extend({}, clientConfig, { reconnect: 50 }))

    beforeEach(function(done) {
      client.on('connection lost', function() { received.push('connection lost') })
      client.on('connected', function() { received.push('connected') })
      received = []
      async.series([
        function(next) { wsServer.start(next) },
        function(next) { client.start(next) }
      ], done)
    })

    var assertConnected = function() {
      assert.ok(_.isString(client.id) && client.id.length > 5)
      assert.equal(client.status(), 'started')
    }

    var assertDisconnected = function() {
      assert.equal(client.status(), 'stopped')
    }

    it('should reconnect', function(done) {
      client._config.reconnect = 50
      assert.deepEqual(received, ['connected'])
      assertConnected()
      async.series([
        function(next) {
          client.once('connection lost', next)
          wsServer.connections[0].close()
        },
        function(next) {
          assertDisconnected()
          client.once('connected', next)
        }
      ], function(err) {
        if (err) throw err
        assertConnected()
        assert.deepEqual(received, ['connected', 'connection lost', 'connected'])
        done()
      })
    })

    it('should work as well when reconnecting several times', function(done) {
      client._config.reconnect = 30
      assert.deepEqual(received, ['connected'])
      assertConnected()

      // Test that we don't bind handlers several times when reconnection happens.
      // For this we just listen to 'subscribe' acknowledgment and see that we got
      // the expected messages in the end
      var allMessages = []
      client.on('message', function(address, args) {
        allMessages.push([ address, args ])
      })
      client.on('connected', function() {
        client.send(coreMessages.subscribeAddress, ['/a'])
      })
      client.send(coreMessages.subscribeAddress, ['/a'])

      var disconnectReconnect = function(done) {
        async.series([

          // Stop the server to cause a disconnection,
          // wait for a few retries to happen.
          function(next) {
            assertConnected()
            wsServer.stop()
            setTimeout(next, 250)
          },

          // Restart the server
          function(next) {
            assertDisconnected()
            wsServer.start(next)
          },

          // Wait for the reconnection to happen
          function(next) { client.once('connected', next) }, // wait for reconnection to happen
          function(next) { client.once('message', function() { next() }) }
        ], done)
      }

      async.series([
        // Wait for the 'subscribed' message before continuing
        function(next) { client.once('message', function() { next() }) },
        disconnectReconnect,
        disconnectReconnect,
        disconnectReconnect


      ], function(err) {
        if (err) throw err
        assert.deepEqual(allMessages, [
          [coreMessages.subscribedAddress, ['/a']],
          [coreMessages.subscribedAddress, ['/a']],
          [coreMessages.subscribedAddress, ['/a']],
          [coreMessages.subscribedAddress, ['/a']]
        ])
        assert.deepEqual(received, [
          'connected',
          'connection lost', 'connected',
          'connection lost', 'connected',
          'connection lost', 'connected'
        ])
        done()
      })
    })

    it('should work fine if the server is full when trying to reconnect', function(done) {
      var dummySockets
      client._config.reconnect = 100

      assertConnected()
      async.series([
        function(next) {
          wsServer.connections[0].close()
          setTimeout(next, 10)
        },
        function(next) {
          helpers.dummyWebClients(wsServer, serverConfig.port, 2, function(err, sockets) {
            dummySockets = sockets
            next()
          })
        },
        function(next) {
          assertDisconnected()
          client.once('queued', next)
        },
        function(next) {
          dummySockets[0].close()
          client.once('connected', next)
        },
        function(next) {
          assertConnected()
          wsServer.stop() // do it again
          setTimeout(next, 150)
        },
        function(next) {
          wsServer.start(next)
          assertDisconnected()
          helpers.dummyWebClients(wsServer, serverConfig.port, 2, function(err, sockets) {
            dummySockets = sockets
            next()
          })
        },
        function(next) {
          client.once('queued', next)
        },
        function(next) {
          dummySockets[0].close()
          client.once('connected', next)
        }
      ], function(err) {
        if (err) throw err
        assertConnected()
        done()
      })
    })

  })

})
