var assert = require('assert')
  , _ = require('underscore')
  , async = require('async')
  , oscCore = require('../../../../lib/server/core/osc-core')
  , shared = require('../../../../lib/shared')
  , helpers = require('../../../helpers')


var assertBufferGetSent = function(client, buf, done) {
  var server = new oscCore.createOSCServer(client.port, client.transport)
  async.waterfall([
    server.start.bind(server),

    function(next) {
      server.once('message', function(address, args) {
        assert.equal(address, '/someBuffer')
        assert.equal(args.length, 1)
        next(null, args[0])
      })
      client.send('/someBuffer', [buf])
    },

    function(buf, next){
      server.stop(function(err) { next(err, buf) })
    }

  ], done)
  return server
}

var serverTestSuite = function(transport) {
  describe('OSCServer - ' + transport, function() {

    it('should not cause problem with if starting/stopping several times', function(done) {
      var client = new oscCore.createOSCClient('127.0.0.1', 9001, transport)
        , server = new oscCore.createOSCServer(9001, transport)
        , messageHandler

      async.series([
        server.start.bind(server),
        function(next) {
          var _messageHandler = helpers.waitForAnswers(2, function(received) { next(null, received) })
          messageHandler = function(address, args) { _messageHandler(1, address, args) }
          server.on('message', messageHandler)
          client.send('/blabla', [1, 2, 3])
          client.send('/hello/helli', [])
        },
        server.stop.bind(server),
        server.stop.bind(server),
        server.start.bind(server),
        server.start.bind(server),
        function(next) {
          server.removeListener('message', messageHandler)
          _messageHandler = helpers.waitForAnswers(1, function(received) { next(null, received) })
          messageHandler = function(address, args) { _messageHandler(2, address, args) }
          server.on('message', messageHandler)
          client.send('/bloblo', ['hello'])
        }
      ], function(err, results) {
        if (err) throw err
        results.shift()
        assert.deepEqual(results.shift(), [
          [1, '/blabla', [1, 2, 3]],
          [1, '/hello/helli', []]
        ])
        _(4).times(function() { results.shift() })
        assert.deepEqual(results.shift(), [
          [2, '/bloblo', ['hello']]
        ])
        server.stop(done)
      })
    })

    it('should start the server and be able to receive', function(done) {
      var server = new oscCore.createOSCServer(9001, transport)
        , client = new oscCore.createOSCClient('127.0.0.1', 9001, transport)
        , messageHandler

      messageHandler = helpers.waitForAnswers(2, function(received) {
        assert.deepEqual(received, [
          ['/blabla', [1, 2, 3]],
          ['/hello/helli', []],
        ])
        server.stop(done)
      })
      server.on('message', function(address, args) { messageHandler(address, args) })

      server.start(function(err) {
        if (err) throw err
        client.send('/blabla', [1, 2, 3])
        client.send('/hello/helli', [])
      })
    })

  })

}

var clientTestSuite = function(transport, extra) {

  describe('OSCClient - ' + transport, function() {

    it('should send small buffers', function(done) {
      var client = new oscCore.createOSCClient('127.0.0.1', 4444, transport)
        , buf = new Buffer(10)
      assertBufferGetSent(client, buf, function(err, rBuf) {
        if (err) throw err
        assert.deepEqual(buf, rBuf)
        done()
      })
    })

    if (extra) extra()

  })

}


describe('osc-core', function() {

  describe('OSCServer', function() {

    describe('start', function() {

      it('should throw an error if starting twice servers on same port', function(done) {
        var server1 = new oscCore.createOSCServer(9001, 'udp')
          , server2 = new oscCore.createOSCServer(9001, 'udp')

        server1.start(function(err) {
          if (err) throw err
          server2.start(function(err) {
            assert.ok(err)
            server1.stop(done)
          })
        })
      })

    })

  })

  serverTestSuite('udp')
  clientTestSuite('udp', function() {

    it('should fail to send big buffers', function(done) {
      var client = new oscCore.createOSCClient('127.0.0.1', 4444, 'udp')
        , buf = new Buffer(Math.pow(2, 16))
        , server
      server = assertBufferGetSent(client, buf, function(err, rBuf) {
        if (err) throw err
        done(new Error('shouldnt come here'))
      })
      setTimeout(server.stop.bind(server, done), 1000)
    })

  })

  serverTestSuite('tcp')
  clientTestSuite('tcp', function() {

    it('should send big buffers', function(done) {
      var client = new oscCore.createOSCClient('127.0.0.1', 4444, 'tcp')
        , buf = new Buffer(Math.pow(2, 16))
      assertBufferGetSent(client, buf, function(err, rBuf) {
        if (err) throw err
        assert.deepEqual(buf, rBuf)
        done()
      })
    })

  })


})