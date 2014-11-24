var assert = require('assert')
  , _ = require('underscore')
  , connections = require('../../lib/connections')
  , helpers = require('../helpers')

describe('connections', function() {

  describe('send', function() {

    it('should send messages from subspaces', function() {
      var received = []
      var connection = new helpers.DummyConnection(function(address, args) {
        received.push([address, args])
      })

      connections.subscribe(connection, '/a')
      assert.equal(connections.send('/a', [44]), null)
      assert.equal(connections.send('/a/b', [55]), null)
      assert.equal(connections.send('/', [66]), null)
      assert.equal(connections.send('/c', [77]), null)
      assert.equal(connections.send('/a/d', [88]), null)
      assert.equal(connections.send('/a/', [99]), null)

      helpers.assertSameElements(received, [
        ['/a', [44]],
        ['/a/b', [55]],
        ['/a/d', [88]],
        ['/a', [99]]
      ])
    })

  })

  describe('subscribe', function() {

    it('should return an error message if address in not valid', function() {
      assert.ok(_.isString(connections.subscribe({}, '')))
      assert.ok(_.isString(connections.subscribe({}, 'bla')))
      assert.ok(_.isString(connections.subscribe({}, '/sys/bla')))
    })

  })

})
