var _ = require('underscore')
  , fs = require('fs')
  , async = require('async')
  , assert = require('assert')
  , oscServer = require('../../../lib/server/osc')
  , connections = require('../../../lib/server/connections')
  , utils = require('../../../lib/server/utils')
  , shared = require('../../../lib/shared')
  , helpers = require('../../helpers')

var config = {

  webPort: 8000,
  oscPort: 9000, 
  rootUrl: '/', 
  usersLimit: 5,

  clients: [
    {ip: '127.0.0.1', appPort: 9001, useBlobClient: true, blobClientPort: 44444},
    {ip: '127.0.0.1', appPort: 9002, useBlobClient: true, blobClientPort: 44445},
    {ip: '127.0.0.1', appPort: 9003, useBlobClient: false}
  ]
}

var sendToServer = new utils.OSCClient('localhost', config.oscPort)

describe('osc', function() {

  beforeEach(function(done) { oscServer.start(config, done) })
  afterEach(function(done) { helpers.afterEach(done) })

  describe('send', function() {

    it('should transmit to osc connections subscribed to that address', function(done) {
      helpers.dummyOSCClients(6, config.clients, function(received) {
        helpers.assertSameElements(received, [
          [9001, shared.subscribedAddress, ['/bla']],
          [9002, shared.subscribedAddress, ['/']],

          [9001, '/bla', ['haha', 'hihi']],
          [9002, '/bla', ['haha', 'hihi']],
          [9002, '/blo/bli', ['non', 'oui', 1, 2]],

          [9002, '/empty', []]
        ])
        assert.deepEqual(dummyConn.received, [['/blo/bli', ['non', 'oui', 1, 2]]])
        done()
      })

      // Subscribing our osc clients
      sendToServer.send(shared.subscribeAddress, [9001, '/bla'])
      sendToServer.send(shared.subscribeAddress, [9002, '/'])

      // Adding other dummy clients (simulate websockets)
      var dummyConn = { send: function(address, args) { this.received.push([address, args]) }, received: [] }
      connections.subscribe(dummyConn, '/blo')

      // Sending messages
      sendToServer.send('/bla', ['haha', 'hihi'])
      sendToServer.send('/blo/bli', ['non', 'oui', 1, 2])
      sendToServer.send('/empty')
    })

    it('should transmit blobs to blob clients', function(done) {
      var oscClients = [
        {ip: '127.0.0.1', appPort: 44444}, // fake the blob client 1
        {ip: '127.0.0.1', appPort: 44445}, // fake the blob client 2
        config.clients[2]                  // app client that doesn't use blob client
      ]

      helpers.dummyOSCClients(7, oscClients, function(received) {
        helpers.assertSameElements(received, [
          [9003, shared.subscribedAddress, ['/blo']],

          [44444, '/blo', [new Buffer('hahaha'), 'hihi', new Buffer('poil')]],
          [44445, '/blo', [new Buffer('hahaha'), 'hihi', new Buffer('poil')]],
          [9003, '/blo', [new Buffer('hahaha'), 'hihi', new Buffer('poil')]],

          [44444, '/blo/bli', [new Buffer('qwerty')]],
          [44445, '/blo/bli', [new Buffer('qwerty')]],
          [9003, '/blo/bli', [new Buffer('qwerty')]]
        ])
        done()
      })

      // Subscribing our osc clients
      sendToServer.send(shared.subscribeAddress, [9001, '/blo'])
      sendToServer.send(shared.subscribeAddress, [9002, '/blo'])
      sendToServer.send(shared.subscribeAddress, [9003, '/blo'])

      // Sending messages with blobs
      sendToServer.send('/blo', [new Buffer('hahaha'), 'hihi', new Buffer('poil')])
      sendToServer.send('/blo/bli', [new Buffer('qwerty')])
    })

    it('should request the blob client to send a blob when asked for it', function(done) {
      var oscClients = [
        {ip: '127.0.0.1', appPort: 44444}, // fake the blob client 1
        {ip: '127.0.0.1', appPort: 44445}, // fake the blob client 2
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

    it('should return an error if sending to an invalid address', function(done) {
      var oscClients = [
        {ip: '127.0.0.1', appPort: 9001},
        {ip: '127.0.0.1', appPort: 9002}
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

})
