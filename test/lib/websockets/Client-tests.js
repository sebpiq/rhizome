var _ = require('underscore')
  , fs = require('fs')
  , urlparse = require('url')
  , async = require('async')
  , assert = require('assert')
  , WebSocket = require('ws')
  , rimraf = require('rimraf')
  , websockets = require('../../../lib/websockets')
  , connections = require('../../../lib/connections')
  , coreMessages = require('../../../lib/core/messages')
  , helpers = require('../../helpers')

var serverConfig = {
  port: 8000,
  rootUrl: '/',
  maxSockets: 2
}

var clientConfig = {
  port: 8000,
  hostname: 'localhost',
  reconnect: 0,
}

var wsServer = new websockets.Server(serverConfig)

var assertConnected = function(client) {
  var allOpenClients = wsServer._wsServer.clients.filter(function(s) {
      return s.readyState === WebSocket.OPEN
    }) 
    , dummyWebClients = allOpenClients.filter(function(s) {
      var query = urlparse.parse(s.upgradeReq.url, true).query
      return query.hasOwnProperty('dummies')
    })
  assert.equal(client.status(), 'started')
  assert.equal(allOpenClients.length - dummyWebClients.length, 1)
  assert.ok(_.isString(client.id) && client.id.length > 0)
}

var assertDisconnected = function(client) {
  assert.equal(client.status(), 'stopped')
}

describe('websockets.Client', function() {

  describe('start', function() {
    var client = new websockets.Client(clientConfig)
      , manager = new connections.ConnectionManager({
        store: new connections.NoStore()
      })

    beforeEach(function(done) {
      connections.manager = manager
      async.series([
        manager.start.bind(manager),
        wsServer.start.bind(wsServer)
      ], done)
    })

    afterEach(function(done) {
      client.removeAllListeners()
      client._isBrowser = false
      delete global.Modernizr
      helpers.afterEach([wsServer, client, manager], done)
    })

    it('should return ValidationError if config is not valid', function(done) {
      helpers.assertConfigErrors([
        [new websockets.Client({}), ['.hostname', '.port']]
      ], done)
    })

    it('should open a socket connection to the server', function(done) {
      var received
      assertDisconnected(client)
      assert.equal(client.id, null)

      client.start(function(err) {
        if (err) throw err
        assertConnected(client)
        // Test that the 'connected' event is emitted after client is started
        client.on('connected', function() { done() })
      })
    })

    it('should return an error if client is not supported', function(done) {
      var received = []
      // Fake Modernizr
      global.Modernizr = { websocketsbinary: true }
      Modernizr.websocketsbinary = false
      client._isBrowser = true
      client.on('connected', function() { throw new Error('should not connect') })
      client.start(function(err) {
        assert.ok(err)
        assert.equal(err.name, 'NotSupported')
        done()
      })
    })

    it('should return an error if the server is not responding and reconnect is 0', function(done) {
      assertDisconnected(client)
      assert.equal(client.id, null)
      async.series([
        function(next) { wsServer.stop(next) },
        function(next) { setTimeout(next, 50) },
        function(next) { client.start(next) }
      ], function(err) {
        assert.ok(err)
        assertDisconnected(client)
        assert.equal(client.id, null)
        done()
      })
    })

    it('should reject connection when server is full and reconnect is 0', function(done) {
      var received
        , configNoReconnect = _.extend({}, clientConfig, { reconnect: 0 })
        , clientNoReconnect = new websockets.Client(configNoReconnect)
        , dummyClients = [ { port: serverConfig.port }, { port: serverConfig.port } ]
      assertDisconnected(clientNoReconnect)
      assert.equal(client.id, null)

      async.waterfall([
        helpers.dummyWebClients.bind(helpers, wsServer, dummyClients),
        function(sockets, messages, next) {
          assert.equal(wsServer._wsServer.clients[0].readyState, WebSocket.OPEN)
          clientNoReconnect.start(next)
        }
      ], function(err, next) {
        assert.ok(err)
        assert.equal(err.name, 'ConnectionRefused')
        clientNoReconnect.stop(done)
      })
    })

    it('should retry connecting when server is full and reconnect is not 0', function(done) {
      var dummyClients = [ { port: serverConfig.port }, { port: serverConfig.port } ]
        , configReconnect = _.extend({}, clientConfig, { reconnect: 50 })
        , clientReconnect = new websockets.Client(configReconnect)
      assertDisconnected(clientReconnect)
      assert.equal(client.id, null)

      async.waterfall([

        // Fill-up the server with dummy clients. 
        // Connection for `clientReconnect` should be refused 
        helpers.dummyWebClients.bind(this, wsServer, dummyClients),
        function(sockets, messages, next) {
          clientReconnect.start(function(err) { if (err) throw err })
          clientReconnect.once('server full', function(err) { next(err, sockets) })
        },

        // Close one of the dummy clients, now `clientReconnect` should connect
        // automatically 
        function(sockets, next) {
          assertDisconnected(client)
          assert.equal(client.id, null)
          sockets[0].close()
          clientReconnect.once('connected', next)
        }

      ], function(err) {
        if (err) throw err
        assertConnected(clientReconnect)
        clientReconnect.stop(done)
      })
    })

  })

  describe('stop', function() {
    var client = new websockets.Client(clientConfig)

    it('should call the callback even if client is already stopped', function(done) {
      client.stop(done)
    })

  })

  describe('message', function() {
    var client = new websockets.Client(clientConfig)
      , manager = new connections.ConnectionManager({
        store: new connections.NoStore()
      })

    beforeEach(function(done) {
      connections.manager = manager
      async.series([
        manager.start.bind(manager),
        wsServer.start.bind(wsServer),
        client.start.bind(client)
      ], done)
    })

    afterEach(function(done) {
      client.removeAllListeners()
      helpers.afterEach([wsServer, client, manager], done)
    })

    it('should receive messages from the specified address', function(done) {
      assert.equal(manager._nsTree.has('/place1'), false)

      var subscribed = function(address, args) {
        assert.equal(address, coreMessages.subscribedAddress)
        assert.deepEqual(args, ['/place1'])
        assert.equal(manager._nsTree.has('/place1'), true)
        assert.equal(manager._nsTree.get('/place1').connections.length, 1)
        manager.send('/place2', [44])
        manager.send('/place1', [1, 2, 3])
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
        manager.send('/a', [new Buffer('hahaha'), 1234, 'blabla'])
        manager.send('/a/b', [new Buffer('hello')])
        manager.send('/a', [5678, new Buffer('hihi'), 'prout', new Buffer('hoho')])
        manager.send('/a/', [new Buffer('huhu'), new Buffer('hyhy')])
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
    var client = new websockets.Client(clientConfig)
      , manager = new connections.ConnectionManager({
        store: new connections.NoStore()
      })

    beforeEach(function(done) {
      connections.manager = manager
      async.series([
        manager.start.bind(manager),
        wsServer.start.bind(wsServer),
        client.start.bind(client)
      ], done)
    })

    afterEach(function(done) {
      client.removeAllListeners()
      helpers.afterEach([wsServer, client, manager], done)
    })

    it('should send messages to the specified address', function(done) {
      // Creating dummy connections
      var dummyConnections = helpers.dummyConnections(3, 2, function(received) {
        helpers.assertSameElements(received, [
          [0, '/bla', [1, 2, 3]],
          [0, '/blo', ['oui', 'non']],
          [1, '/bla', [1, 2, 3]]
        ])
        done()
      })
      // Assign id to connections
      dummyConnections.forEach(function(c, i) { c.id = i.toString() })

      async.series([
        manager.open.bind(manager, dummyConnections[0]),
        manager.open.bind(manager, dummyConnections[1])
      ], function(err) {
        if (err) throw err

        // Subscribing them to receive what's sent by our client
        manager.subscribe(dummyConnections[0], '/')
        manager.subscribe(dummyConnections[1], '/bla')

        // Sending messages
        client.send('/bla', [1, 2, 3])
        client.send('/blo', ['oui', 'non'])
      })

    })

    it('should handle things correctly when sending blobs', function(done) {
      // Creating dummy connections
      var dummyConnections = helpers.dummyConnections(6, 2, function(received) {
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
      // Assign id to connections
      dummyConnections.forEach(function(c, i) { c.id = i.toString() })

      async.series([
        manager.open.bind(manager, dummyConnections[0]),
        manager.open.bind(manager, dummyConnections[1])
      ], function(err) {
        if (err) throw err

        // Subscribing them to receive what's sent by our client
        manager.subscribe(dummyConnections[0], '/bla/blob')
        manager.subscribe(dummyConnections[0], '/blu/blob')
        manager.subscribe(dummyConnections[1], '/')

        // Sending messages containing blobs
        client.send('/bla/blob', [1, new Buffer('blobba'), 'blabla'])
        client.send('/blo/blob', [new Buffer('blobbo1'), 1234, new Buffer('blobbo2')])
        client.send('/blu/blob/', [new Buffer('blobbu'), 'hoho', 5678])
        client.send('/bli/blob/', [new Buffer('blobbi')])
      })
    })

    it('should handle things correctly when sending ArrayBuffer', function(done) {
      // Creating dummy connections
      var dummyConnections = helpers.dummyConnections(2, 2, function(received) {
        helpers.assertSameElements(received, [
          [0, '/bla/blob', [1, new Buffer([12, 23, 34, 45, 56]), 'blabla']],
          [1, '/bla/blob', [1, new Buffer([12, 23, 34, 45, 56]), 'blabla']]
        ])
        done()
      })
      // Assign id to connections
      dummyConnections.forEach(function(c, i) { c.id = i.toString() })

      async.series([
        manager.open.bind(manager, dummyConnections[0]),
        manager.open.bind(manager, dummyConnections[1])
      ], function(err) {
        if (err) throw err

        // Subscribing them to receive what's sent by our client
        manager.subscribe(dummyConnections[0], '/')
        manager.subscribe(dummyConnections[1], '/')

        // Sending messages containing blobs
        client.send('/bla/blob', [1, (new Uint8Array([12, 23, 34, 45, 56])).buffer, 'blabla'])
      })
    })

    it('should work when sending no arguments', function(done) {
      var dummyConnections = helpers.dummyConnections(1, 1, function(received) {
        helpers.assertSameElements(received, [[0, '/bla', []]])
        done()
      })
      // Assign id to connections 
      dummyConnections.forEach(function(c, i) { c.id = i.toString() })

      manager.open(dummyConnections[0], function(err) {
        if (err) throw err
        manager.subscribe(dummyConnections[0], '/bla')
        client.send('/bla/')
      })

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
      , client = new websockets.Client(configReconnect)
      , manager = new connections.ConnectionManager({
          store: new connections.NoStore()
        })
      , received = []

    beforeEach(function(done) {
      connections.manager = manager
      client.on('error', function() {}) // Just to avoid throwing
      client.on('connection lost', function() { received.push('connection lost') })
      client.on('server full', function() { received.push('server full') })
      client.on('connected', function() { received.push('connected') })
      received = []
      async.series([
        manager.start.bind(manager),
        wsServer.start.bind(wsServer),
        function(next) {
          client.start()
          client.once('connected', next) // wait for the event to not confuse the tests
        }
      ], done)
    })

    afterEach(function(done) {
      client.removeAllListeners()
      helpers.afterEach([wsServer, client, manager], done)
    })

    it('should reconnect', function(done) {
      client._config.reconnect = 50
      assert.deepEqual(received, ['connected'])
      assertConnected(client)
      async.series([
        function(next) {
          client.once('connection lost', next)
          wsServer.connections[0].close()
        },
        function(next) {
          assertDisconnected(client)
          client.once('connected', next)
        }
      ], function(err) {
        if (err) throw err
        assertConnected(client)
        assert.deepEqual(received, ['connected', 'connection lost', 'connected'])
        done()
      })
    })

    it('should work as well when reconnecting several times', function(done) {
      client._config.reconnect = 30
      assert.deepEqual(received, ['connected'])
      assertConnected(client)

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
            assertConnected(client)
            wsServer.stop()
            setTimeout(next, 250)
          },

          // Restart the server
          function(next) {
            assertDisconnected(client)
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
      var dummyClients, dummySockets = []
      client._config.reconnect = 100

      assertConnected(client)

      var disconnectReconnect = function(done) {
        async.series([
          // Stop the client and fill-up the server with other sockets
          client.stop.bind(client),
          function(next) {
            var serverSpace = serverConfig.maxSockets - wsServer._getActiveSockets().length
            dummyClients = _.range(serverSpace).map(function() { 
              return { port: serverConfig.port }
            })
            helpers.dummyWebClients(wsServer, dummyClients, function(err, sockets) {
              sockets.forEach(function(socket) { dummySockets.push(socket) })
              next()
            })
          },

          // Start the client, connection attempts are rejected because server is full
          function(next) {
            assertDisconnected(client)
            client.start()
            var serverFullCb = helpers.waitForAnswers(3, function() { 
              client.removeAllListeners('server full')
              next()
            })
            client.on('server full', serverFullCb)
          },

          // Make space on the server by closing the first active socket, 
          // the client should now manage to connect
          function(next) {
            _.find(dummySockets, function(socket) { return socket.readyState <= 1 }).close()
            client.once('connected', next)
          }
        ], function(err) {
          if (err) throw err
          assertConnected(client)
          done()
        })
      }

      async.series([
        disconnectReconnect,
        disconnectReconnect
      ], done)
    })

  })

  describe('cookies', function() {

    var cookies = require('cookies-js')
      , dbDir = '/tmp/rhizome-test-db/'
      , client = new websockets.Client(clientConfig)
      , manager = new connections.ConnectionManager({
        store: new connections.NEDBStore(dbDir)
      })
    client._isBrowser = true

    beforeEach(function(done) {
      connections.manager = manager

      // Cookie mock-up for testing
      cookies._set = cookies.set
      cookies._get = cookies.get
      cookies.get = function() { return cookies._value }
      cookies.set = function(key, value) { cookies._value = value }
      cookies._value = null

      // navigator mock-up for testing
      global.navigator = { oscpu: 'seb OS', userAgent: 'seb Agent' }

      // Fake Modernizr
      global.Modernizr = { websocketsbinary: true }

      client.on('error', function() {}) // Just to avoid throwing
      async.series([
        rimraf.bind(rimraf, dbDir),
        manager.start.bind(manager),
        wsServer.start.bind(wsServer),
        client.start.bind(client)
      ], done)
    })

    afterEach(function(done) {
      cookies._value = null
      cookies.set = cookies._set
      cookies.get = cookies._get
      client.removeAllListeners()
      delete global.navigator
      delete global.Modernizr
      helpers.afterEach([wsServer, client, manager], done)
    })


    it('should recover the client infos (subscriptions, os, ...) if the client is known', function(done) {
      var client2 = new websockets.Client(clientConfig)
        , savedId = client.id
      client2._isBrowser = true
      cookies._value = client.id
      assert.equal(manager._nsTree.has('/blou'), false)
      global.navigator = { oscpu: 'should be ignored', userAgent: 'should be ignored' }

      async.series([
        // Subscribe the client to an address
        function(next) {
          client.send(coreMessages.subscribeAddress, ['/blou'])
          client.once('message', function(address, args) {
            assert.deepEqual(address, coreMessages.subscribedAddress)
            assert.equal(manager._nsTree.get('/blou').connections.length, 1)
            next()
          })
        },

        // Stop it, and create another client with id read from the cookie
        client.stop.bind(client),
        function(next) {
          assert.equal(manager._nsTree.get('/blou').connections.length, 0)
          client2.start(next)
        }
        
      ], function(err) {
        if (err) throw err

        // Check that the client gets assigned the same id, check that subscriptions
        // are restored.
        assert.equal(client2.id, savedId)
        assert.equal(manager._nsTree.get('/blou').connections.length, 1)
        
        // Test that the connection infos got restored
        assert.deepEqual(
          manager._nsTree.get('/blou').connections[0].infos,
          {os: 'seb OS', browser: 'seb Agent'}
        )

        client2.stop(done)
      })
    })


    it('should ignore the id if the client is not known', function(done) {
      var client2 = new websockets.Client(clientConfig)
        , id2 = 'Idontexist'
      client2.id = id2
      client2._isBrowser = true
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
