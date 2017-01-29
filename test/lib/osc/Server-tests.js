"use strict";
var _ = require('underscore')
  , fs = require('fs')
  , async = require('async')
  , assert = require('assert')
  , oscTransport = require('../../../lib/osc/transport')
  , osc = require('../../../lib/osc')
  , connections = require('../../../lib/connections')
  , coreMessages = require('../../../lib/core/messages')
  , helpers = require('../../helpers-backend')

var config = {
  port: 9000,
  blobsPort: 33333
}

var oscServer = new osc.Server(config)

// Connects the clients, configuring blob client if necessary
var doConnection = function(clients) {
  return function() {
    var done = _.last(arguments)
      , usingBlobClient = clients.filter((c) => c.useBlobClient)
    usingBlobClient.forEach((c) => {
      var args
      if (c.blobsPort) args = [c.appPort, 'blobClient', c.blobsPort]
      else args = [c.appPort, 'blobClient']
      sendToServer.send(coreMessages.configureAddress, args)
    })

    helpers.dummyOSCClients(usingBlobClient.length, usingBlobClient, (received) => {
      helpers.assertSameElements(received, usingBlobClient.map((c) => {
        return [c.appPort, coreMessages.configuredAddress, [c.blobsPort || 44444]]
      }))
      done()
    })
  }

}

var sendToServer = new oscTransport.createClient('localhost', config.port, 'udp')

describe('osc', function() {
  var manager = new connections.ConnectionManager({
    store: new connections.NoStore()
  })

  beforeEach(function(done) { helpers.beforeEach([ manager, oscServer ], done) })
  afterEach(function(done) { 
    oscServer.removeAllListeners('error') 
    helpers.afterEach([ oscServer, manager ], done) 
  })

  describe('Server', () => {

    describe('start', function() {

      it('should return ValidationError if config is not valid', function(done) {
        helpers.assertConfigErrors([
          [new osc.Server({}), ['.port']],
          [new osc.Server({blobsPort: 'bla'}), ['.port', '.blobsPort']]
        ], done)
      })

      it('should re-open connections that have been persisted and restore blob clients', function(done) {
        var oscClients = [
            {ip: '127.0.0.1', appPort: 9001},
            {ip: '127.0.0.1', appPort: 9002},
            {ip: '127.0.0.1', appPort: 9003}
          ], conn9001
          , store = new connections.NEDBStore(helpers.testDbDir)
          , manager = new connections.ConnectionManager({ store: store })
        connections.manager = manager

        async.series([

          // Send 'subscribe' messages to trigger creation of 3 osc connections
          manager.start.bind(manager),
          function(next) {
            sendToServer.send(coreMessages.subscribeAddress, [9001, '/bla'])
            sendToServer.send(coreMessages.subscribeAddress, [9002, '/bli'])
            sendToServer.send(coreMessages.subscribeAddress, [9003, '/bla/blo'])
            helpers.dummyOSCClients(3, oscClients, next.bind(this, null))
          },
          function(next) {
            assert.equal(oscServer.connections.length, 3)
            assert.equal(manager._openConnections.length, 3)
            conn9001 = _.find(oscServer.connections, function(c) {
              return c.id === '127.0.0.1:9001'
            })
            conn9001.infos.bla = 999
            conn9001.infos.blobsPort = 8888
            next()
          },

          // Create new clean manager and osc server.
          oscServer.stop.bind(oscServer),
          function(next) {
            manager = new connections.ConnectionManager({ store: store })
            connections.manager = manager
            oscServer = new osc.Server(config)
            oscServer.start(next)
          },

          // Check that connections have been restored with subscribed addresses
          // and other persisted info
          function(next) {
            assert.equal(oscServer.connections.length, 3)
            assert.deepEqual(
              _.uniq(_.pluck(oscServer.connections, 'ip'))
              ['127.0.0.1']
            )
            var appPorts = _.pluck(oscServer.connections, 'appPort')
            appPorts.sort()
            assert.strictEqual(appPorts[0], 9001)
            assert.strictEqual(appPorts[1], 9002)
            assert.strictEqual(appPorts[2], 9003)

            helpers.dummyOSCClients(2, oscClients, next.bind(this, null))
            sendToServer.send('/bla/blo', [0, 1, '2'])
          }

        ], function(err, results) {
          if (err) throw err
          var received = results.pop()
          helpers.assertSameElements(received, [
            [9001, '/bla/blo', [0, 1, '2']],
            [9003, '/bla/blo', [0, 1, '2']]
          ])
          conn9001 = _.find(oscServer.connections, function(c) {
            return c.id === '127.0.0.1:9001'
          })
          assert.deepEqual(conn9001.infos, { bla: 999, blobsPort: 8888 })
          assert.ok(conn9001.blobClient)
          done()
        })
      })

      it('should always persist blob client config', function(done) {
        var store = new connections.NEDBStore(helpers.testDbDir)
          , manager = new connections.ConnectionManager({ store: store })
        connections.manager = manager

        async.series([

          // Configure the blob client for one OSC connection.
          manager.start.bind(manager),
          function(next) {
            sendToServer.send(coreMessages.configureAddress, [9001, 'blobClient', 11111])
            helpers.dummyOSCClients(1, [ {ip: '127.0.0.1', appPort: 9001} ], next.bind(this, null))
          },

          // Create a new manager with no open connection, and stop the osc server, before
          // creating a new, clean one.
          oscServer.stop.bind(oscServer),
          function(next) {
            manager = new connections.ConnectionManager({ store: store })
            connections.manager = manager
            oscServer = new osc.Server(config)
            oscServer.start(next)
          }

        ], function(err) {
          if (err) throw err
          var connection = oscServer.connections[0]
          assert.deepEqual(connection.infos, { blobsPort: 11111 })
          assert.ok(connection.blobClient)
          assert.equal(connection.blobClient.port, 11111)
          done()
        })
      })

    })

    describe('stop', function() {

      it('should close all connections properly', function(done) {
        var oscClients = [
          {ip: '127.0.0.1', appPort: 9001},
          {ip: '127.0.0.1', appPort: 9002},
          {ip: '127.0.0.1', appPort: 9003}
        ]
        async.series([
          // Send 'subscribe' messages to trigger creation of 3 osc connections
          (next) => {
            sendToServer.send(coreMessages.subscribeAddress, [9001, '/bla'])
            sendToServer.send(coreMessages.subscribeAddress, [9002, '/bli'])
            sendToServer.send(coreMessages.subscribeAddress, [9003, '/bla/blo'])
            helpers.dummyOSCClients(3, oscClients, next.bind(this, null))
          },

          (next) => {
            assert.equal(manager._openConnections.length, 3)
            assert.equal(oscServer.connections.length, 3)
            oscServer.stop(next)
          }

        ], (err) => {
          if (err) done(err)
          assert.equal(manager._openConnections.length, 0)
          assert.equal(oscServer.connections.length, 0)
          done()
        })
      })

    })

    describe('onMessage', function() {

      it('should transmit to osc connections subscribed to that address', function(done) {
        // List of OSC clients
        var oscClients = [
            {ip: '127.0.0.1', appPort: 9001, useBlobClient: true}, // default value should be used
            {ip: '127.0.0.1', appPort: 9002, blobsPort: 44445, useBlobClient: true},
            {ip: '127.0.0.1', appPort: 9003}
          ]
          , dummyServer = new helpers.DummyServer
          , dummyReceived = []

        async.waterfall([
          // Do OSC connection with blob clients
          doConnection(oscClients),

          // Adding dummy clients (simulate websockets)
          dummyServer.openConnection.bind(dummyServer, [ (address, args) => dummyReceived.push([address, args]), 'bla' ]),

          // Do subscribe
          function(dummyConnection, next) {
            manager.subscribe(dummyConnection, '/blo')
            helpers.dummyOSCClients(2, oscClients, next.bind(this, null))
            sendToServer.send(coreMessages.subscribeAddress, [9001, '/bla'])
            sendToServer.send(coreMessages.subscribeAddress, [9002, '/'])
          },

          // Checking received and sending some messages
          function(received, next) {
            helpers.assertSameElements(received, [
              [9001, coreMessages.subscribedAddress, ['/bla']],
              [9002, coreMessages.subscribedAddress, ['/']]
            ])
            helpers.dummyOSCClients(4, oscClients, next.bind(this, null))
            sendToServer.send('/bla', ['haha', 'hihi'])
            sendToServer.send('/blo/bli', ['non', 'oui', 1, 2])
            sendToServer.send('/empty')
          },

          // Checking the messages received
          function(received, next) {
            helpers.assertSameElements(received, [
              [9001, '/bla', ['haha', 'hihi']],
              [9002, '/bla', ['haha', 'hihi']],
              [9002, '/blo/bli', ['non', 'oui', 1, 2]],

              [9002, '/empty', []]
            ])
            assert.deepEqual(dummyReceived, [['/blo/bli', ['non', 'oui', 1, 2]]])
            done()
          }

        ])

      })

      it('should transmit blobs to blob clients', function(done) {
        var blobClients = [
          {ip: '127.0.0.1', appPort: 44444, transport: 'tcp'}, // fake the blob client 1
          {ip: '127.0.0.1', appPort: 44445, transport: 'tcp'}, // fake the blob client 2
          {ip: '127.0.0.1', appPort: 9003, transport: 'udp'} // client 9003 is receiving blobs directly
        ]

        var oscClients = [
          {ip: '127.0.0.1', appPort: 9001, blobsPort: 44444, useBlobClient: true},
          {ip: '127.0.0.1', appPort: 9002, blobsPort: 44445, useBlobClient: true},
          {ip: '127.0.0.1', appPort: 9003}
        ]

        async.waterfall([
          doConnection(oscClients),

          // Subscribing OSC clients
          function(next) {
            sendToServer.send(coreMessages.subscribeAddress, [9001, '/blo'])
            sendToServer.send(coreMessages.subscribeAddress, [9002, '/blo'])
            sendToServer.send(coreMessages.subscribeAddress, [9003, '/blo'])
            helpers.dummyOSCClients(3, oscClients, next.bind(this, null))
          },

          // Checking received and sending some messages with blobs
          function(received, next) {
            helpers.assertSameElements(received, [
              [9001, coreMessages.subscribedAddress, ['/blo']],
              [9002, coreMessages.subscribedAddress, ['/blo']],
              [9003, coreMessages.subscribedAddress, ['/blo']]
            ])
            helpers.dummyOSCClients(6, blobClients, next.bind(this, null))
            sendToServer.send('/blo', [new Buffer('hahaha'), 'hihi', new Buffer('poil')])
            sendToServer.send('/blo/bli', [new Buffer('qwerty')])
          },

          // Checking the messages received
          function(received, next) {
            helpers.assertSameElements(received, [
              [44444, '/blo', [9001, new Buffer('hahaha'), 'hihi', new Buffer('poil')]],
              [44445, '/blo', [9002, new Buffer('hahaha'), 'hihi', new Buffer('poil')]],
              [9003, '/blo', [new Buffer('hahaha'), 'hihi', new Buffer('poil')]],

              [44444, '/blo/bli', [9001, new Buffer('qwerty')]],
              [44445, '/blo/bli', [9002, new Buffer('qwerty')]],
              [9003, '/blo/bli', [new Buffer('qwerty')]]
            ])
            done()
          }

        ])
      })

      it('should bubble-up blob client errors', function(done) {
        // OSC client with a forbidden `blobsPort`.
        var oscClients = [
          {ip: '127.0.0.1', appPort: 9001, blobsPort: 81, useBlobClient: true}
        ]

        oscServer.on('error', (err) => console.error(err.message))
        console.log('\nDO NOT PANIC : this is just a test (should say "blob client refused connection")')
        
        async.waterfall([
          doConnection(oscClients),

          // Subscribing an OSC connection, and cause the blob to be sent to that
          // forbidden port
          function(next) {
            var oscConn = oscServer.connections[0]
            manager.subscribe(oscConn, '/bla')
            sendToServer.send('/bla', [new Buffer('blo')])
            setTimeout(done, 1000)
          }

        ])
      })

    })

  })

  describe('Connection', () => {

    describe('sys messages', function() {

      it('should bubble-up error if invalid port value', function(done) {
        oscServer.on('error', (err) => console.error(err.message))
        sendToServer.send(coreMessages.subscribeAddress, ['/blabla'])
        sendToServer.send(coreMessages.subscribeAddress, [-10])
        sendToServer.send(coreMessages.subscribeAddress, [10000000])
        sendToServer.send(coreMessages.subscribeAddress, [config.port])

        console.log('\nDO NOT PANIC : this is just a test (should say "invalid port" and "currently in use by the rhizome server")')
        setTimeout(done, 1800)
      })

    })

    describe('receive a blob', function() {

      it('should request the blob client to send a blob when asked for it', function(done) {
        var oscClients = [
          {ip: '127.0.0.1', appPort: 9001, blobsPort: 44444, useBlobClient: true},
          {ip: '127.0.0.1', appPort: 9002, blobsPort: 44445, useBlobClient: true},
        ]

        var blobClients = [
          {ip: '127.0.0.1', appPort: 44444, transport: 'tcp'}, // fake the blob client 1
          {ip: '127.0.0.1', appPort: 44445, transport: 'tcp'}, // fake the blob client 2
        ]

        async.series([
          doConnection(oscClients),

          function(next) {
            // Simulate request to send a blob
            sendToServer.send(coreMessages.sendBlobAddress, [9002, '/bla/blo', '/tmp/hihi', 11, 22, 33])

            helpers.dummyOSCClients(1, blobClients, function(received) {
              helpers.assertSameElements(received, [
                [44445, coreMessages.sendBlobAddress, ['/bla/blo', '/tmp/hihi', 11, 22, 33]]
              ])
              done()
            })
          }
        ])

      })

      it('should return an error if invalid address', function(done) {
        var oscClients = [
          {ip: '127.0.0.1', appPort: 9001, blobsPort: 44444, useBlobClient: true}
        ]

        async.series([
          doConnection(oscClients),

          function(next) {
            // Simulate request to send a blob
            sendToServer.send(coreMessages.sendBlobAddress, [9001, 'bla', '/tmp/hihi'])

            helpers.dummyOSCClients(1, oscClients, function(received) {
              received.forEach(function(r) {
                var args = _.last(r)
                assert.ok(_.isString(args[0]))
                args.pop()
              })
              helpers.assertSameElements(received, [
                [9001, coreMessages.errorAddress, []]
              ])
              done()
            })
          }
        ])
      })

    })

  })

})
