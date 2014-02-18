var _ = require('underscore')
  , fs = require('fs')
  , async = require('async')
  , assert = require('assert')
  , oscServer = require('../../lib/server/osc')
  , connections = require('../../lib/server/connections')
  , utils = require('../../lib/server/utils')
  , shared = require('../../lib/shared')
  , helpers = require('../helpers')

var config = {
  server: {
    ip: '127.0.0.1',
    webPort: 8000,
    oscPort: 9000, 
    rootUrl: '/', 
    usersLimit: 5, 
    blobsDirName: '/tmp'
  },
  clients: [
    {id: 1, ip: '127.0.0.1', oscPort: 9001},
    {id: 2, ip: '127.0.0.1', oscPort: 9002},
    {id: 3, ip: '127.0.0.1', oscPort: 9003}
  ]
}

var sendToServer = new utils.OSCClient('localhost', config.server.oscPort)

describe('osc', function() {

  beforeEach(function(done) { oscServer.start(config, done) })
  afterEach(function(done) { helpers.afterEach(done) })

  describe('subscribe', function() {

    it('should subscribe the osc connection to the given address', function(done) {
      helpers.dummyOSCClients(3, config.clients, function(received) {
        helpers.assertSameElements(received, [
          [1, shared.subscribedAddress, [1, '/bla']],
          [2, shared.subscribedAddress, [2, '/bla/']],
          [2, shared.subscribedAddress, [2, '/']]
        ])
        assert.equal(connections._nsTree.get('/bla').data.connections.length, 2)
        assert.equal(connections._nsTree.get('/').data.connections.length, 1)
        done()
      })

      sendToServer.send(shared.subscribeAddress, [1, '/bla'])
      sendToServer.send(shared.subscribeAddress, [2, '/bla/'])
      sendToServer.send(shared.subscribeAddress, [2, '/'])
    })

  })

  describe('message', function() {

    it('should transmit to osc connections subscribed to that address', function(done) {
      helpers.dummyOSCClients(5, config.clients, function(received) {
        helpers.assertSameElements(received, [
          [1, shared.subscribedAddress, [1, '/bla']],
          [2, shared.subscribedAddress, [2, '/']],

          [1, '/bla', ['haha', 'hihi']],
          [2, '/bla', ['haha', 'hihi']],
          [2, '/blo/bli', ['non', 'oui', 1, 2]]
        ])
        assert.deepEqual(dummyConn.received, [['/blo/bli', ['non', 'oui', 1, 2]]])
        done()
      })

      // Subscribing our osc clients
      sendToServer.send(shared.subscribeAddress, [1, '/bla'])
      sendToServer.send(shared.subscribeAddress, [2, '/'])

      // Adding other dummy clients (simulate websockets)
      var dummyConn = { send: function(address, args) { this.received.push([address, args]) }, received: [] }
      connections.subscribe('/blo', dummyConn)

      // Sending messages
      sendToServer.send('/bla', ['haha', 'hihi'])
      sendToServer.send('/blo/bli', ['non', 'oui', 1, 2])
    })

  })

})
