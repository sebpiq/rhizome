var _ = require('underscore')
  , assert = require('assert')
  , Connection = require('../../../lib/server/Connection')
  , connections = require('../../../lib/server/connections') 
  , shared = require('../../../lib/shared')
  , helpers = require('../../helpers')

describe('Connection', function() {

  describe('subscribe', function() {

    it('should subscribe the osc connection to the given address', function() {
      var received = []

      var dummyConnection1 = new helpers.DummyConnection(function(address, args) {
        received.push([1, address, args])
      })
      var dummyConnection2 = new helpers.DummyConnection(function(address, args) {
        received.push([2, address, args])
      })
      dummyConnection1.onSysMessage(shared.subscribeAddress, ['/bla'])
      dummyConnection2.onSysMessage(shared.subscribeAddress, ['/bla/'])
      dummyConnection1.onSysMessage(shared.subscribeAddress, ['/'])

      helpers.assertSameElements(received, [
        [1, shared.subscribedAddress, ['/bla']],
        [2, shared.subscribedAddress, ['/bla/']],
        [1, shared.subscribedAddress, ['/']]
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

      connections.send('/bla', [1, 'toitoi', new Buffer('hello')])
      connections.send('/bla/blo', [111])
      connections.send('/blu', ['feeling'])
      connections.send('/bla/blo', [222])
      connections.send('/bli', [])
      connections.send('/bly', [new Buffer('tyutyu')])
      connections.send('/bla', [2, 'tutu', new Buffer('hello')])
      connections.send('/bla/blo', [333])

      dummyConnection.onSysMessage(shared.resendAddress, ['/bla']) // Blobs
      dummyConnection.onSysMessage(shared.resendAddress, ['/bla/blo'])
      dummyConnection.onSysMessage(shared.resendAddress, ['/bli']) // Empty messages
      dummyConnection.onSysMessage(shared.resendAddress, ['/neverSeenBefore']) // Address that never received a message

      helpers.assertSameElements(received, [
        ['/bla', [2, 'tutu', new Buffer('hello')]],
        ['/bla/blo', [333]],
        ['/bli', []],
        ['/neverSeenBefore', []]
      ])
    })

  })

})
