var _ = require('underscore')
  , assert = require('assert')
  , Connection = require('../../../lib/core/server').Connection
  , connections = require('../../../lib/connections') 
  , coreMessages = require('../../../lib/core/messages')
  , helpers = require('../../helpers')

afterEach(function(done) { helpers.afterEach(done) })

describe('core.server.Connection', function() {

  describe('subscribe', function() {

    it('should subscribe the osc connection to the given address', function() {
      var received = []

      var dummyConnection1 = new helpers.DummyConnection(function(address, args) {
        received.push([1, address, args])
      })
      var dummyConnection2 = new helpers.DummyConnection(function(address, args) {
        received.push([2, address, args])
      })
      connections.open(dummyConnection2, function(err) { if(err) throw err })
      connections.open(dummyConnection1, function(err) { if(err) throw err })

      dummyConnection1.onSysMessage(coreMessages.subscribeAddress, ['/bla'])
      dummyConnection2.onSysMessage(coreMessages.subscribeAddress, ['/bla/'])
      dummyConnection1.onSysMessage(coreMessages.subscribeAddress, ['/'])

      helpers.assertSameElements(received, [
        [1, coreMessages.subscribedAddress, ['/bla']],
        [2, coreMessages.subscribedAddress, ['/bla/']],
        [1, coreMessages.subscribedAddress, ['/']]
      ])
      assert.equal(connections._nsTree.get('/bla').connections.length, 2)
      assert.equal(connections._nsTree.get('/').connections.length, 1)
    })

  })

  describe('resend', function() {

    it('should resend the last messages sent at that address', function() {
      var received = []

      var dummyConnection = new helpers.DummyConnection(function(address, args) {
        received.push([address, args])
      })
      connections.open(dummyConnection, function(err) { if(err) throw err })

      connections.send('/bla', [1, 'toitoi', new Buffer('hello')])
      connections.send('/bla/blo', [111])
      connections.send('/blu', ['feeling'])
      connections.send('/bla/blo', [222])
      connections.send('/bli', [])
      connections.send('/bly', [new Buffer('tyutyu')])
      connections.send('/bla', [2, 'tutu', new Buffer('hello')])
      connections.send('/bla/blo', [333])

      dummyConnection.onSysMessage(coreMessages.resendAddress, ['/bla']) // Blobs
      dummyConnection.onSysMessage(coreMessages.resendAddress, ['/bla/blo'])
      dummyConnection.onSysMessage(coreMessages.resendAddress, ['/bli']) // Empty messages
      dummyConnection.onSysMessage(coreMessages.resendAddress, ['/neverSeenBefore']) // Address that never received a message

      helpers.assertSameElements(received, [
        ['/bla', [2, 'tutu', new Buffer('hello')]],
        ['/bla/blo', [333]],
        ['/bli', []],
        ['/neverSeenBefore', []]
      ])
    })

    it('should send empty list if the address exists but no last message', function() {
      var received = []

      var dummyConnection = new helpers.DummyConnection(function(address, args) {
        received.push([address, args])
      })
      connections.open(dummyConnection, function(err) { if(err) throw err })

      dummyConnection.onSysMessage(coreMessages.subscribeAddress, ['/bla'])
      dummyConnection.onSysMessage(coreMessages.resendAddress, ['/bla'])

      helpers.assertSameElements(received, [
        ['/sys/subscribed', ['/bla']],
        ['/bla', []]
      ])
    })

  })

})
