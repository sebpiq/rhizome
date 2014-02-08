var _ = require('underscore')
  , async = require('async')
  , assert = require('assert')
  , osc = require('node-osc')
  , wsServer = require('../lib/server/websockets')
  , oscServer = require('../lib/server/osc')
  , client = require('../lib/client/client')

var config = {
    server: { port: 8000, rootUrl: '/', usersLimit: 40 },
    osc: { port: 9000, hostname: 'localhost', clients: [] }
  }
  , oscClient = new osc.Client(config.server.hostname, config.osc.port)

// For testing : we need to add standard `removeEventListener` method cause `ws` doesn't implement it.
var WebSocket = require('ws')
WebSocket.prototype.removeEventListener = function(name, cb) {
  this._events[name] = _.reject(this._events[name], function(other) {
    return other._listener === cb
  })
}

// Helper to create dummy connections from other clients
var dummyConnections = function(count, done) {
  async.series(_.range(count).map(function(i) {
    return function(next) {
      socket = new WebSocket('ws://localhost:' + config.server.port)
      _dummies.push(socket)
      socket.addEventListener('open', function() { next() })
    }
  }), done)
}
_dummies = []


describe('client <-> server', function() {

  afterEach(function() { _dummies = [] })

  describe('start', function() {
    
    beforeEach(function(done) {
      config.server.usersLimit = 1
      wsServer.start(config, done)
    })
    afterEach(function(done) {
      config.server.usersLimit = 10
      wsServer.stop(done)
    })
    afterEach(function(done) { client.stop(done) })

    it('should open a socket connection to the server', function(done) {
      assert.equal(wsServer.sockets, 0)
      assert.equal(client.userId, null)
      client.start({ retry: 0 }, function(err) {
        if (err) throw err
        assert.equal(wsServer.sockets.length, 1)
        assert.equal(client.userId, 0)
        done()
      })
    })

    it('should reject connection if server is full', function(done) {
      assert.equal(wsServer.sockets, 0)
      assert.equal(client.userId, null)
      async.series([
        function(next) { dummyConnections(1, next) },
        function(next) { client.start(next) }
      ], function(err) {
        assert.ok(err)
        assert.equal(wsServer.sockets.length, 1)
        assert.equal(client.userId, null)
        done()
      })
    })

  })

  describe('listen', function() {
    
    beforeEach(function(done) { wsServer.start(config, done) })
    beforeEach(function(done) { client.start({ retry: 0 }, done) })
    before(function(done) { oscServer.start(config, done) })
    afterEach(function(done) { wsServer.stop(done) })

    it('should receive messages from the specified address', function(done) {
      assert.equal(wsServer.nsTree.has('/place1'), false)
      
      var listend = function(err) {
        if (err) throw err
        assert.equal(wsServer.nsTree.has('/place1'), true)
        assert.equal(wsServer.nsTree.get('/place1').data.sockets.length, 1)
        oscClient.send('/place2', 44)
        oscClient.send('/place1', 1, 2, 3)
      }

      var handler = function(address, args) {
        assert.equal(address, '/place1')
        assert.deepEqual(args, [1, 2, 3])
        done()
      }

      client.listen('/place1', handler, listend)
    })

    it('shouldn\'t cause problem if listening twice same place', function(done) {
      var answered = 0

      var handler = function() {}          

      var listend = function(err) {
        if (err) throw err
        answered++
        assert.equal(wsServer.nsTree.get('/place1').data.sockets.length, 1)
        if (answered === 2) done()
      }

      client.listen('/place1', handler, listend)
      client.listen('/place1', handler, listend)
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

      client.listen('/a', handler, listend)
    })

  })

  describe('disconnections, server', function() {

    beforeEach(function(done) { wsServer.start(config, done) })
    afterEach(function(done) { wsServer.stop(done) })

    it('should forget the socket', function(done) {
      var socket, socketsBefore
      assert.equal(wsServer.sockets.length, 0)
      async.series([
        function(next) { dummyConnections(2, next) },
        function(next) {
          socketsBefore = wsServer.sockets.slice(0)
          client.start({ retry: 0 }, next)
        },
        function(next) {
          socket = _.difference(wsServer.sockets, socketsBefore)[0]
          client.listen('/someAddr', function() {}, function(err) {
            assert.equal(wsServer.nsTree.get('/someAddr').data.sockets.length, 1)
            next(err)
          }) 
        },
        function(next) {
          assert.equal(wsServer.sockets.length, 3)
          client.stop(next)
        }
      ], function(err) {
        if (err) throw err
        assert.equal(wsServer.sockets.length, 2)
        assert.equal(wsServer.sockets.indexOf(socket), -1)
        assert.equal(wsServer.nsTree.get('/someAddr').data.sockets.length, 0)
        done()
      })
    })

  })

  describe('disconnections, client', function() {

    beforeEach(function(done) { wsServer.start(config, done) })
    afterEach(function(done) { wsServer.stop(done) })

    it('should retry connection', function(done) {
      assert.equal(wsServer.sockets.length, 0)
      async.series([
        function(next) { client.start({ retry: 100 }, next) },
        function(next) { client.listen('/someAddr', function() {}, next) },
        function(next) {
          assert.equal(wsServer.sockets.length, 1)
          assert.equal(wsServer.nsTree.get('/someAddr').data.sockets.length, 1)
          assert.equal(client.userId, 0)

          wsServer.forget(wsServer.sockets[0])

          assert.equal(wsServer.sockets.length, 0)
          assert.equal(wsServer.nsTree.get('/someAddr').data.sockets.length, 0)
          setTimeout(next, 50)
        },
        function(next) {
          // userId should be null 
          assert.equal(client.userId, null)
          setTimeout(next, 200)
        },
        function(next) {
          // the reconnection should have happened by then, and all things restored
          assert.equal(wsServer.sockets.length, 1)
          assert.equal(wsServer.nsTree.get('/someAddr').data.sockets.length, 1)
          assert.equal(client.userId, 0)
          next()
        }
      ], function(err) {
        if (err) throw err
        done()
      })
    })

  })

})
