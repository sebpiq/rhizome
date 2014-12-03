var _ = require('underscore')
  , fs = require('fs')
  , async = require('async')
  , assert = require('assert')
  , moscow = require('moscow')
  , osc = require('../../../lib/osc')
  , connections = require('../../../lib/connections')
  , coreMessages = require('../../../lib/core/messages')
  , helpers = require('../../helpers')

var config = {
  port: 9000,
  blobsPort: 33333
}

var oscServer = new osc.Server(config)

// Connects the clients, configuring blob client if necessary
var doConnection = function(clients) {
  return function(done) {
    var usingBlobClient = clients.filter(function(c) { return c.useBlobClient })
    usingBlobClient.forEach(function(c) {
      if (c.blobsPort) args = [c.appPort, 'blobClient', c.blobsPort]
      else args = [c.appPort, 'blobClient']
      sendToServer.send(coreMessages.configureAddress, args)
    })

    helpers.dummyOSCClients(usingBlobClient.length, usingBlobClient, function(received) {
      helpers.assertSameElements(received, usingBlobClient.map(function(c) {
        return [c.appPort, coreMessages.configuredAddress, [c.blobsPort || 44444]]
      }))
      done()
    })
  }

}

var sendToServer = new moscow.createClient('localhost', config.port, 'udp')

describe('osc.Server', function() {

  beforeEach(function(done) {
    async.series([
      connections.start.bind(connections),
      oscServer.start.bind(oscServer)
    ], done)
  })
  afterEach(function(done) { helpers.afterEach([oscServer], done) })

  describe('start', function() {

    it('should return ValidationError if config is not valid', function(done) {
      helpers.assertConfigErrors([
        [new osc.Server({}), ['.port']],
        [new osc.Server({blobsPort: 'bla'}), ['.port', '.blobsPort']]
      ], done)
    })

  })

  describe('send', function() {

    it('should transmit to osc connections subscribed to that address', function(done) {
      // List of OSC clients
      var oscClients = [
        {ip: '127.0.0.1', appPort: 9001, useBlobClient: true}, // default value should be used
        {ip: '127.0.0.1', appPort: 9002, blobsPort: 44445, useBlobClient: true},
        {ip: '127.0.0.1', appPort: 9003}
      ]

      // Adding dummy clients (simulate websockets)

      var dummyConnection = new helpers.DummyConnection(function(address, args) {
        dummyReceived.push([address, args])
      }), dummyReceived = []

      connections.open(dummyConnection, function(err) {
        if (err) throw err
        connections.subscribe(dummyConnection, '/blo')

        async.waterfall([
          doConnection(oscClients),

          // Do subscribe
          function(next) {
            sendToServer.send(coreMessages.subscribeAddress, [9001, '/bla'])
            sendToServer.send(coreMessages.subscribeAddress, [9002, '/'])
            helpers.dummyOSCClients(2, oscClients, next.bind(this, null))
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

    it('shouldnt crash if the client has thrown an error', function(done) {
      // OSC client with a forbidden `blobsPort`.
      var oscClients = [
        {ip: '127.0.0.1', appPort: 9001, blobsPort: 81, useBlobClient: true}
      ]

      console.log('\nDO NOT PANIC : this is just a test (should say "blob client refused connection")')
      async.waterfall([
        doConnection(oscClients),

        // Subscribing an OSC connection, and cause the blob to be sent to that
        // forbidden port
        function(next) {
          var oscConn = oscServer.connections[0]
          connections.subscribe(oscConn, '/bla')
          sendToServer.send('/bla', [new Buffer('blo')])
          setTimeout(done, 1000)
        }

      ])
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
