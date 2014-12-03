var assert = require('assert')
  , _ = require('underscore')
  , ConnectionManager = require('../../../lib/connections/ConnectionManager')
  , helpers = require('../../helpers')


describe('ConnectionManager', function() {

  describe('send', function() {

    var connections = new ConnectionManager({})
    beforeEach(function(done) { connections.start(done) })
    afterEach(function(done) { connections.stop(done) })

    it('should send messages from subspaces', function(done) {
      var received = []
      var connection = new helpers.DummyConnection(function(address, args) {
        received.push([address, args])
      })

      connections.open(connection, function(err) {
        if(err) throw err
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
        done()
      })

    })

  })

  describe('subscribe', function() {

    var connections = new ConnectionManager({})
    beforeEach(function(done) { connections.start(done) })
    afterEach(function(done) { connections.stop(done) })

    it('should return an error message if address in not valid', function(done) {
      var connection = new helpers.DummyConnection()
      connections.open(connection, function(err) {
        if(err) throw err
        assert.ok(_.isString(connections.subscribe(connection, '')))
        assert.ok(_.isString(connections.subscribe(connection, 'bla')))
        assert.ok(_.isString(connections.subscribe(connection, '/sys/bla')))
        done()
      })
    })

  })

})
