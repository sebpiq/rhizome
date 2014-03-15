var _ = require('underscore')
  , fs = require('fs')
  , async = require('async')
  , assert = require('assert')
  , oscServer = require('../../../lib/server/osc')
  , connections = require('../../../lib/server/connections')
  , utils = require('../../../lib/server/core/utils')
  , oscCore = require('../../../lib/server/core/osc-core')
  , shared = require('../../../lib/shared')
  , helpers = require('../../helpers')

var config = {

  webPort: 8000,
  oscPort: 9000,
  blobsPort: 33333,
  rootUrl: '/', 
  usersLimit: 5,

  clients: [
    {ip: '127.0.0.1', appPort: 9001, useBlobClient: true, blobsPort: 44444},
    {ip: '127.0.0.1', appPort: 9002, useBlobClient: true, blobsPort: 44445},
    {ip: '127.0.0.1', appPort: 9003, useBlobClient: false}
  ]
}

var sendToServer = new oscCore.createOSCClient('localhost', config.oscPort, 'udp')

describe('osc', function() {

  beforeEach(function(done) { oscServer.start(config, done) })
  afterEach(function(done) { helpers.afterEach(done) })

  describe('send', function() {

    it('should transmit to osc connections subscribed to that address', function(done) {
      // Subscribing our osc clients
      sendToServer.send(shared.subscribeAddress, [9001, '/bla'])
      sendToServer.send(shared.subscribeAddress, [9002, '/'])

      // Adding other dummy clients (simulate websockets)
      var dummyConn = { send: function(address, args) { this.received.push([address, args]) }, received: [] }
      connections.subscribe(dummyConn, '/blo')

      async.waterfall([

        // Waiting for subscription acknowledgement
        function(next) {
          helpers.dummyOSCClients(2, config.clients, next.bind(this, null))
        },

        // Checking received and sending some messages
        function(received, next) {
          helpers.assertSameElements(received, [
            [9001, shared.subscribedAddress, ['/bla']],
            [9002, shared.subscribedAddress, ['/']]
          ])
          helpers.dummyOSCClients(4, config.clients, next.bind(this, null))
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
          assert.deepEqual(dummyConn.received, [['/blo/bli', ['non', 'oui', 1, 2]]])
          done()
        }

      ])
    })

    it('should transmit blobs to blob clients', function(done) {
      var oscClients = [
        {ip: '127.0.0.1', appPort: 44444, transport: 'tcp'}, // fake the blob client 1
        {ip: '127.0.0.1', appPort: 44445, transport: 'tcp'}, // fake the blob client 2
        config.clients[2]                  // app client that doesn't use blob client
      ]

      sendToServer.send(shared.subscribeAddress, [9001, '/blo'])
      sendToServer.send(shared.subscribeAddress, [9002, '/blo'])
      sendToServer.send(shared.subscribeAddress, [9003, '/blo'])

      async.waterfall([

        // Waiting for subscription acknowledgement
        function(next) {
          helpers.dummyOSCClients(1, oscClients, next.bind(this, null))
        },

        // Checking received and sending some messages with blobs
        function(received, next) {
          helpers.assertSameElements(received, [
            [9003, shared.subscribedAddress, ['/blo']]
          ])
          helpers.dummyOSCClients(6, oscClients, next.bind(this, null))
          sendToServer.send('/blo', [new Buffer('hahaha'), 'hihi', new Buffer('poil')])
          sendToServer.send('/blo/bli', [new Buffer('qwerty')])
        },

        // Checking the messages received
        function(received, next) {
          helpers.assertSameElements(received, [
            [44444, '/blo', [new Buffer('hahaha'), 'hihi', new Buffer('poil')]],
            [44445, '/blo', [new Buffer('hahaha'), 'hihi', new Buffer('poil')]],
            [9003, '/blo', [new Buffer('hahaha'), 'hihi', new Buffer('poil')]],

            [44444, '/blo/bli', [new Buffer('qwerty')]],
            [44445, '/blo/bli', [new Buffer('qwerty')]],
            [9003, '/blo/bli', [new Buffer('qwerty')]]
          ])
          done()
        }

      ])
    })

    it('should return an error if sending to an invalid address', function(done) {
      var oscClients = [
        {ip: '127.0.0.1', appPort: 9001}, // Fakes some app client
        {ip: '127.0.0.1', appPort: 9002} // Fakes some app client
      ]

      helpers.dummyOSCClients(2, oscClients, function(received) {
        received.forEach(function(r) {
          var args = _.last(r)
          assert.ok(_.isString(args[0]))
          args.pop()
        })
        helpers.assertSameElements(received, [
          [9001, shared.errorAddress, []],
          [9002, shared.errorAddress, []]
        ])
        done()
      })

      sendToServer.send('/broadcast/bla', [11, 22, 33])
    })

  })

  describe('receive a blob', function() {

    it('should request the blob client to send a blob when asked for it', function(done) {
      var oscClients = [
        {ip: '127.0.0.1', appPort: 44444, transport: 'tcp'}, // fake the blob client 1
        {ip: '127.0.0.1', appPort: 44445, transport: 'tcp'}, // fake the blob client 2
      ]

      helpers.dummyOSCClients(1, oscClients, function(received) {
        helpers.assertSameElements(received, [
          [44445, shared.sendBlobAddress, ['/bla/blo', '/tmp/hihi', 11, 22, 33]]
        ])
        done()
      })

      // Simulate request to send a blob
      sendToServer.send(shared.sendBlobAddress, [9002, '/bla/blo', '/tmp/hihi', 11, 22, 33])
    })

  })

})
