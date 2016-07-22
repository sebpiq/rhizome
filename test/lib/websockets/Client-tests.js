"use strict";
var _ = require('underscore')
  , async = require('async')
  , assert = require('assert')
  , Buffer = require('buffer').Buffer
  , WebSocket = require('ws')
  , coreMessages = require('../../../lib/core/messages')
  , helpers = require('../../helpers-everywhere')
  , WebSocketClient = require('../../../lib/websockets/Client')
  , wssCommands = require('../../browser/websocket-server-commands')
  , isBrowser, port
  , wss // only if not testing in browser 
isBrowser = typeof window !== 'undefined'

var clientConfig = {
  reconnect: 0,
}

if (!isBrowser) {
  clientConfig.port = 8000
  clientConfig.hostname = 'localhost'
  wssCommands.config.baseUrl = 'http://' + clientConfig.hostname + ':' + clientConfig.port
} else mocha.checkLeaks = false

describe('websockets.Client', function() {

  if (isBrowser) this.timeout(30000)

  before(function(done) {
    if (!isBrowser) {
      // This is used for mocking-up browser tests on node
      global.location = { protocol: 'http:' }
      global.window = { WebSocket: WebSocket }
      global.navigator = null
      wss = new (require('../../browser/websocket-server'))({ port: clientConfig.port })
      wss.start(done)
    } else done()
  })

  after(function(done) {
    if (!isBrowser) {
      wss.stop(done)
    } else done()
    if (!isBrowser) {
      delete global.window
      delete global.location
      delete global.navigator
    }
  })

  afterEach(function() {
    global.window.WebSocket = WebSocket
  })

  describe('start', function() {
    var client = new WebSocketClient(clientConfig)

    beforeEach(function(done) {
      wssCommands.startServer({}, done)
    })

    afterEach(function(done) {
      WebSocketClient._isBrowser = false
      client.removeAllListeners()
      async.series([
        _.bind(client.stop, client), 
        _.bind(wssCommands.stopServer, this, {})
      ], done)
    })

    it('should return ValidationError if config is not valid', function(done) {
      helpers.assertConfigErrors([
        [new WebSocketClient({ hostname: 8890, port: 'bla' }), ['.hostname', '.port']]
      ], done)
    })

    it('should throw ValidationError if config is not valid and no start callback', function() {
      var clientBadConfig = new WebSocketClient({ hostname: 8890, port: 'bla' })
        , thrown = false
      try {
        clientBadConfig.start()
      } catch(err) {
        thrown = true
        helpers.assertValidationError(err, ['.hostname', '.port']) 
      }
      assert.ok(thrown)
    })

    it('should open a socket connection to the server', function(done) {
      var received

      async.series([
        _.bind(wssCommands.assertDisconnected, this, client),
        _.bind(client.start, client),
        function(next) { client.on('connected', function() { next() }) },
        _.bind(wssCommands.assertConnected, this, client),
      ], done)
    })

    it('should return an error if client is not supported', function(done) {
      // Fake a browser with no WebSocket support
      WebSocketClient._isBrowser = true
      delete global.window.WebSocket

      client.on('connected', function() { throw new Error('should not connect') })
      client.start(function(err) {
        assert.ok(err)
        assert.equal(err.name, 'NotSupported')
        done()
      })
    })

    it('should return an error if the server is not responding and reconnect is 0', function(done) {
      async.series([
        _.bind(wssCommands.assertDisconnected, this, client),
        _.bind(wssCommands.stopServer, this, {}),
        function(next) { setTimeout(next, 50) },
        _.bind(client.start, client)
      ], function(err) {
        assert.ok(err)
        wssCommands.assertDisconnected(client, done)
      })
    })

    it('should reject connection when server is full and reconnect is 0', function(done) {
      var received
        , configNoReconnect = _.extend({}, clientConfig, { reconnect: 0 })
        , clientNoReconnect = new WebSocketClient(configNoReconnect)

      async.series([
        _.bind(wssCommands.assertDisconnected, this, clientNoReconnect),
        wssCommands.fillUpServer,
        _.bind(clientNoReconnect.start, clientNoReconnect)
      ], function(err, next) {
        assert.ok(err)
        assert.equal(err.name, 'ConnectionRefused')
        clientNoReconnect.stop(done)
      })
    })

    it('should retry connecting when server is full and reconnect is not 0', function(done) {
      var configReconnect = _.extend({}, clientConfig, { reconnect: 50 })
        , clientReconnect = new WebSocketClient(configReconnect)

      async.series([
        _.bind(wssCommands.assertDisconnected, this, clientReconnect),
        wssCommands.fillUpServer,
        function(next) {
          clientReconnect.start(function(err) { if (err) throw err })
          clientReconnect.once('server full', next)
        },

        // Close one of the dummy clients, now `clientReconnect` should connect
        // automatically
        function(next) {
          wssCommands.freeUpServer(function(err) { if (err) throw err })
          clientReconnect.once('connected', next)
        },
        _.bind(wssCommands.assertConnected, this, clientReconnect),


      ], function(err) {
        if (err) throw err
        clientReconnect.stop(done)
      })
    })

  })

  describe('stop', function() {
    var client = new WebSocketClient(clientConfig)

    it('should call the callback even if client is already stopped', function(done) {
      client.stop(done)
    })

  })

  describe('message', function() {
    var client = new WebSocketClient(clientConfig)

    beforeEach(function(done) {
      async.series([
        _.bind(wssCommands.startServer, this, {}),
        client.start.bind(client)
      ], done)
    })

    afterEach(function(done) {
      client.removeAllListeners()
      async.series([
        _.bind(client.stop, client), 
        _.bind(wssCommands.stopServer, this, {})
      ], done)
    })

    it('should receive messages from the specified address', function(done) {

      async.waterfall([

        // Check that no connection is listening to our address
        _.bind(wssCommands.getNamespaceInfos, this, '/place1'),
        function(infos, next) { 
          assert.equal(infos.length, 0)
          next()
        },

        // Subscribe, receive confirmation and check that we are subscribed
        function(next) {
          client.send(coreMessages.subscribeAddress, ['/place1'])
          client.once('message', function(address, args) { next(null, address, args) })
        }, 
        function(address, args, next) {
          assert.equal(address, coreMessages.subscribedAddress)
          assert.deepEqual(args, ['/place1'])
          wssCommands.getNamespaceInfos('/place1', next)
        },
        function(infos, next) {
          assert.equal(infos.length, 1)
          next()
        },

        // Try sending messages to the address the client subscribed to
        function(next) {
          client.on('message', function(address, args) { next(null, address, args) })
          wssCommands.sendMessage('/place2', [44])
          wssCommands.sendMessage('/place1', [1, 2, 3])
        },
        function(address, args, next) {
          assert.equal(address, '/place1')
          assert.deepEqual(args, [1, 2, 3])
          next()
        }
      ], done)
    })

    it('should receive blobs', function(done) {

      async.waterfall([

        // Subscribe to address and receive confirmation
        function(next) {
          client.send(coreMessages.subscribeAddress, ['/a'])
          client.once('message', function(address, args) { next(null, address, args) })
        }, 
        function(address, args, next) {
          assert.equal(address, coreMessages.subscribedAddress)
          assert.deepEqual(args, ['/a'])
          next()
        },

        // Send messages including blobs
        function(next) {
          client.on('message', helpers.waitForAnswers(4, function(r) { next(null, r) }))
          wssCommands.sendMessage('/a', [new Buffer('hahaha'), 1234, 'blabla'])
          wssCommands.sendMessage('/a/b', [new Buffer('hello')])
          wssCommands.sendMessage('/a', [5678, new Buffer('hihi'), 'prout', new Buffer('hoho')])
          wssCommands.sendMessage('/a/', [new Buffer('huhu'), new Buffer('hyhy')])
        },
        function(received, next) {
          helpers.assertSameElements(received, [
            ['/a', [new Buffer('hahaha'), 1234, 'blabla']],
            ['/a/b', [new Buffer('hello')]],
            ['/a', [5678, new Buffer('hihi'), 'prout', new Buffer('hoho')]],
            ['/a', [new Buffer('huhu'), new Buffer('hyhy')]]
          ])
          next()         
        }

      ], done)
    })

  })

  describe('send', function() {
    var client = new WebSocketClient(clientConfig)

    beforeEach(function(done) {
      async.series([
        _.bind(wssCommands.startServer, this, {}),
        client.start.bind(client)
      ], done)
    })

    afterEach(function(done) {
      client.removeAllListeners()
      async.series([
        _.bind(client.stop, client), 
        _.bind(wssCommands.stopServer, this, {})
      ], done)
    })

    it('should send messages to the specified address', function(done) {
      async.waterfall([

        // Subscribe dummy connections
        _.bind(wssCommands.receiveMessage, this, ['/bla']),
        _.bind(wssCommands.receiveMessage, this, ['/']),
        
        // Send some messages
        function(next) {
          client.send('/bla', [1, 2, 3])
          client.send('/blo', ['oui', 'non'])
          next()
        },

        // Check that they have been all received by our dummy connections
        _.bind(wssCommands.fetchReceivedMessages, this, 3),
        function(received, next) {
          helpers.assertSameElements(received, [
            [0, '/bla', [1, 2, 3]],
            [1, '/blo', ['oui', 'non']],
            [1, '/bla', [1, 2, 3]]
          ])
          next()
        }

      ], done)
    })

    it('should send messages correctly when client converts to string (e.g. iOS7)', function(done) {
      // Faking nasty socket to would convert to string before sending
      client._socket._send = client._socket.send
      client._socket.send = function(msg) { 
        return client._socket._send.call(this, msg.toString()) 
      }

      async.waterfall([
        _.bind(wssCommands.receiveMessage, this, ['/']),
        function(next) {
          client.send('/bla', [11, 22])
          next()
        },
        _.bind(wssCommands.fetchReceivedMessages, this, 1),
        function(received, next) {
          helpers.assertSameElements(received, [ [0, '/bla', [11, 22]] ])
          next()
        }
      ], done)

    })

    it('should handle things correctly when sending blobs', function(done) {
      async.waterfall([

        // Subscribe dummy connections
        _.bind(wssCommands.receiveMessage, this, ['/bla/blob', '/blu/blob']),
        _.bind(wssCommands.receiveMessage, this, ['/']),
        
        // Send some messages
        function(next) {
          client.send('/bla/blob', [1, new Buffer('blobba'), 'blabla'])
          client.send('/blo/blob', [new Buffer('blobbo1'), 1234, new Buffer('blobbo2')])
          client.send('/blu/blob/', [new Buffer('blobbu'), 'hoho', 5678])
          client.send('/bli/blob/', [new Buffer('blobbi')])
          next()
        },

        // Check that they have been all received by our dummy connections
        _.bind(wssCommands.fetchReceivedMessages, this, 6),
        function(received, next) {
          helpers.assertSameElements(received, [
            [0, '/bla/blob', [1, new Buffer('blobba'), 'blabla']],
            [0, '/blu/blob', [new Buffer('blobbu'), 'hoho', 5678]],

            [1, '/bla/blob', [1, new Buffer('blobba'), 'blabla']],
            [1, '/blo/blob', [new Buffer('blobbo1'), 1234, new Buffer('blobbo2')]],
            [1, '/blu/blob', [new Buffer('blobbu'), 'hoho', 5678]],
            [1, '/bli/blob', [new Buffer('blobbi')]],
          ])
          next()
        }

      ], done)
    })

    it('should handle things correctly when sending ArrayBuffer', function(done) {
      async.waterfall([

        // Subscribe dummy connections
        _.bind(wssCommands.receiveMessage, this, ['/']),
        
        // Send some messages
        function(next) {
          client.send('/bla/blob', [1, (new Uint8Array([12, 23, 34, 45, 56])).buffer, 'blabla'])
          next()
        },

        // Check that they have been all received by our dummy connections
        _.bind(wssCommands.fetchReceivedMessages, this, 1),
        function(received, next) {
          helpers.assertSameElements(received, [
            [0, '/bla/blob', [1, new Buffer([12, 23, 34, 45, 56]), 'blabla']],
          ])
          next()
        }

      ], done)
    })

    it('should work when sending no arguments', function(done) {
      async.waterfall([

        // Subscribe dummy connections
        _.bind(wssCommands.receiveMessage, this, ['/bla']),
        
        // Send some messages
        function(next) {
          client.send('/bla/')
          next()
        },

        // Check that they have been all received by our dummy connections
        _.bind(wssCommands.fetchReceivedMessages, this, 1),
        function(received, next) {
          helpers.assertSameElements(received, [[0, '/bla', []]])
          next()
        }

      ], done)
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

    var configReconnect = _.extend({}, clientConfig, { reconnect: 50 })
      , client = new WebSocketClient(configReconnect)
      , received = []

    beforeEach(function(done) {
      client.on('error', function() {}) // Just to avoid throwing
      client.on('connection lost', function() { received.push('connection lost') })
      client.on('server full', function() { received.push('server full') })
      client.on('connected', function() { received.push('connected') })
      received = []
      async.series([
        _.bind(wssCommands.startServer, this, {}),
        function(next) {
          client.start()
          client.once('connected', next) // wait for the event to not confuse the tests
        }
      ], done)
    })

    afterEach(function(done) {
      client.removeAllListeners()
      async.series([
        _.bind(client.stop, client), 
        _.bind(wssCommands.stopServer, this, {})
      ], done)
    })

    it('should reconnect automatically', function(done) {
      client._config.reconnect = 50
      assert.deepEqual(received, ['connected'])
      async.series([
        _.bind(wssCommands.assertConnected, this, client),
        function(next) { 
          wssCommands.kickOutClient()
          client.once('connection lost', next)
        },
        _.bind(wssCommands.assertDisconnected, this, client),
        _.bind(client.once, client, 'connected'),
        _.bind(wssCommands.assertConnected, this, client)
      ], function(err) {
        if (err) throw err
        assert.deepEqual(received, ['connected', 'connection lost', 'connected'])
        done()
      })
    })

    it('should work as well when reconnecting several times', function(done) {
      client._config.reconnect = 30
      assert.deepEqual(received, ['connected'])

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

      var disconnectReconnect = function(done) {
        async.series([

          // Stop the server to cause a disconnection,
          // wait for a few retries to happen.
          _.bind(wssCommands.assertConnected, this, client),
          _.bind(wssCommands.stopServer, this, {}),
          function(next) { setTimeout(next, 250) },

          // Restart the server and wait for the reconnection to happen
          _.bind(wssCommands.assertDisconnected, this, client),
          function(next) { 
            wssCommands.startServer({})
            client.once('connected', next) 
          },
          function(next) { client.once('message', function() { next() }) }
        ], done)
      }

      async.series([
        _.bind(wssCommands.assertConnected, this, client),
        // Subscribe client
        function(next) { 
          client.once('message', function() { next() })
          client.send(coreMessages.subscribeAddress, ['/a']) 
        },
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
      var dummyClients
      client._config.reconnect = 100

      var disconnectReconnect = function(done) {
        async.series([
          // Stop the client and fill-up the server with other sockets
          client.stop.bind(client),
          _.bind(wssCommands.fillUpServer, this),

          // Start the client, connection attempts are rejected because server is full
          _.bind(wssCommands.assertDisconnected, this, client),
          function(next) {
            client.start()
            var serverFullCb = helpers.waitForAnswers(3, function() { 
              client.removeAllListeners('server full')
              next()
            })
            client.on('server full', serverFullCb)
          },

          // Make space on the server by closing the first active socket, 
          // the client should now manage to connect
          _.bind(wssCommands.freeUpServer, this),
          _.bind(client.once, client, 'connected'),
          _.bind(wssCommands.assertConnected, this, client)

        ], done)
      }

      async.series([
        _.bind(wssCommands.assertConnected, this, client),
        disconnectReconnect,
        disconnectReconnect
      ], done)
    })

  })

  describe('cookies', function() {

    var cookies = require('cookies-js')
      , dbDir = '/tmp/rhizome-test-db/'
      , client = new WebSocketClient(clientConfig)

    beforeEach(function(done) {
      WebSocketClient._isBrowser = true
      // Cookie mock-up for testing
      if (!isBrowser) {
        cookies._set = cookies.set
        cookies._get = cookies.get
        cookies.get = function() { return cookies._value }
        cookies.set = function(key, value) { cookies._value = value }
        cookies._value = null
        // navigator mock-up for testing
        global.navigator = { oscpu: 'seb OS', userAgent: 'seb Agent' }
      }

      client.on('error', function() {}) // Just to avoid throwing
      async.series([
        _.bind(wssCommands.startServer, this, { store: dbDir }),
        client.start.bind(client)
      ], done)
    })

    afterEach(function(done) {
      if (!isBrowser) {
        cookies._value = null
        cookies.set = cookies._set
        cookies.get = cookies._get
      }
      client.removeAllListeners()
      async.series([
        _.bind(client.stop, client), 
        _.bind(wssCommands.stopServer, this, { store: dbDir })
      ], done)
    })


    it('should recover the client infos (subscriptions, os, ...) if the client is known', function(done) {
      var client2 = new WebSocketClient(clientConfig)
        , savedId = client.id

      if (!isBrowser) {
        cookies._value = client.id
        global.navigator = { oscpu: 'should be ignored', userAgent: 'should be ignored' }
      }

      async.waterfall([
        _.bind(wssCommands.getNamespaceInfos, this, '/blou'),
        function(infos, next) {
          assert.equal(infos.length, 0)
          next()
        },

        // Subscribe the client to an address and check we're subscribed
        function(next) {
          client.send(coreMessages.subscribeAddress, ['/blou'])
          client.once('message', function(address, args) { next(null, address, args) })
        },
        function(address, args, next) {
          assert.deepEqual(address, coreMessages.subscribedAddress)
          next()
        },
        _.bind(wssCommands.getNamespaceInfos, this, '/blou'),
        function(infos, next) {
          assert.equal(infos.length, 1)
          next()
        },

        // Stop the client, and create another client with id read from the cookie
        client.stop.bind(client),
        _.bind(wssCommands.kickOutClient, this),
        _.bind(wssCommands.getNamespaceInfos, this, '/blou'),
        function(infos, next) {
          assert.equal(infos.length, 0)
          client2.start(next)
        },

        // Check that the client gets assigned the same id, check that subscriptions
        // are restored.
        function(next) {
          assert.equal(client2.id, savedId)
          next()
        },
        _.bind(wssCommands.getNamespaceInfos, this, '/blou'),
        function(infos, next) {
          assert.equal(infos.length, 1)
          assert.deepEqual(Object.keys(infos[0]), ['os', 'browser'])
          next()
        }
        
      ], function(err) {
        if (err) throw err
        client2.stop(done)
      })
    })


    it('should ignore the id if the client is not known', function(done) {
      var client2 = new WebSocketClient(clientConfig)
        , id2 = 'Idontexist'
      client2.id = id2

      if (!isBrowser)
        cookies._value = id2

      async.series([
        // Start the client
        client2.start.bind(client2),

        // Check that the client gets assigned a different id
        function(next) {
          assert.ok(client2.id != id2)
          next()
        }
      ], done)
    })

  })

})
