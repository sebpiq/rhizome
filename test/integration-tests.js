var EventEmitter = require('events').EventEmitter
  , _ = require('underscore')
  , assert = require('assert')
  , osc = require('node-osc')
  , server = require('../lib/server/server')
  , client = require('../lib/client/client')

// TODO : customize config
var config = require('../config')
  , oscClient = new osc.Client(config.server.hostname, config.osc.portIn)

// For testing : we need to add standard `removeEventListener` method cause `ws` doesn't implement it.
var WebSocket = require('ws')
WebSocket.prototype.removeEventListener = function(name, cb) {
  this._events[name] = _.reject(this._events[name], function(other) {
    return other._listener === cb
  })
}


describe('client <-> server', function() {
  
  before(function(done) {
    server.start({port: config.server.port, done: done})
  })

  describe('start', function() {
    
    it('should open a socket connection to the server', function(done) {
      assert.equal(server.sockets, 0)
      assert.equal(client.userId, null)
      client.start({
        done: function(err) {
          if (err) throw err
          assert.equal(server.sockets.length, 1)
          assert.equal(client.userId, 0)
          done()
        }
      })
    })

  })

  describe('listen', function() {
    
    beforeEach(function(done) { client.start({done: done}) })

    it('should receive messages from the specified address', function(done) {
      assert.equal(server.namespaces.has('/place1'), false)
      
      var listend = function(err) {
        if (err) throw err
        assert.equal(server.namespaces.has('/place1'), true)
        assert.equal(server.namespaces.get('/place1').data.sockets.length, 1)
        oscClient.send('/place2', 44)
        oscClient.send('/place1', 1, 2, 3)
      }

      var handler = function(address, args) {
        assert.equal(address, '/place1')
        assert.deepEqual(args, [1, 2, 3])
        done()
      }

      client.listen({address: '/place1', handler: handler, done: listend})
    })

    it('shouldn\'t cause problem if listening twice', function(done) {
      var answered = 0

      var handler = function() {}          

      var listend = function(err) {
        if (err) throw err
        answered++
        assert.equal(server.namespaces.get('/place1').data.sockets.length, 1)
        if (answered === 2) done()
      }

      client.listen({address: '/place1', handler: handler, done: listend})
      client.listen({address: '/place1', handler: handler, done: listend})
    })

    it('should receive all messages from subspaces', function(done) {
      var received = []
      var listend = function(err) {
        if (err) throw err
        oscClient.send('/a', 44)
        oscClient.send('/a/b', 55)
        oscClient.send('/', 66)
        oscClient.send('/c', 77)
        oscClient.send('/a/d', 88)
        oscClient.send('/a/', 99)
      }

      var handler = function(address, args) {
        received.push([args[0], address])
        assert.equal(args.length, 1)
        if (received.length === 4) {
          var sortFunc = function(p) { return p[0] }
          assert.deepEqual(
            _.sortBy(received, sortFunc),
            _.sortBy([[44, '/a'], [55, '/a/b'], [88, '/a/d'], [99, '/a']], sortFunc)
          )
          done()
        }
      }

      client.listen({address: '/a', handler: handler, done: listend})
    })

  })

})
