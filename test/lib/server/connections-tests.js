var assert = require('assert')
  , _ = require('underscore')
  , connections = require('../../../lib/server/connections')

describe('connections', function() {

  describe('send', function() {

    it.skip('should send messages from subspaces', function(done) {
      var received = []

      var subscribed = function(err) {
        if (err) throw err
        connections.send('/a', [44])
        connections.send('/a/b', [55])
        connections.send('/', [66])
        connections.send('/c', [77])
        connections.send('/a/d', [88])
        connections.send('/a/', [99])
      }

      var handler = function(address, args) {
        received.push([args[0], address])
        assert.equal(args.length, 1)
        if (received.length === 4) {
          helpers.assertSameElements(
            received, 
            [[44, '/a'], [55, '/a/b'], [88, '/a/d'], [99, '/a']]
          )
          done()
        }
      }

      client.subscribe('/a', handler, subscribed)
    })

    it.skip('should throw an error if args are invalid', function() {
      assert.throws(function() { connections.send('/bla/bli', {}) })
      assert.throws(function() { connections.send('/bla/bli', [1, null]) })
    })

  })

})
