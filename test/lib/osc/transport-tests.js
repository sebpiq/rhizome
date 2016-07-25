"use strict";
var assert = require('assert')
  , EventEmitter = require('events').EventEmitter
  , _ = require('underscore')
  , async = require('async')
  , helpers = require('../../helpers-backend')
  , oscTransport = require('../../../lib/osc/transport')


describe('osc.transport', () => {

  it('should throw an error for an invalid transport', () => {
    assert.throws(() => oscTransport.createServer(5000, 'dontexist'))
    assert.throws(() => oscTransport.createClient(5000, 'blabla', 'dontexist'))
  })

  describe('core._BaseServer', () => {

    var FakeServer = function() { oscTransport._BaseServer.apply(this) }
    _.extend(FakeServer.prototype, oscTransport._BaseServer.prototype, {
      _createSocket: function() { this._sock = new EventEmitter() },
      _bindSocket: function() {},
      start: function() {
        oscTransport._BaseServer.prototype.start.apply(this, arguments)
        this._sock.emit('listening')
      }
    })
    var FakeServer2 = function() { oscTransport._BaseServer.apply(this) }
    _.extend(FakeServer2.prototype, oscTransport._BaseServer.prototype, {
      _createSocket: function() { this._sock = new EventEmitter() },
      _bindSocket: function() {},
      start: function() {
        oscTransport._BaseServer.prototype.start.apply(this, arguments)
      }
    })

    describe('start', () => {

      it('should return an error in callback if connection fails', (done) => {
        var server = new FakeServer2()
        server.start((err) => {
          assert.ok(err)
          done()
        })
        server._sock.emit('error', 'wow')
      })

      it('should emit an error if connection fails', (done) => {
        var server = new FakeServer2()
        server.on('error', (err) => {
          assert.ok(err)
          done()
        })
        server.start()
        server._sock.emit('error', 'wow')
      })

    })

    describe('errors', () => {

      it('should bubble up the error if the socket receives an error while running', (done) => {
        var server = new FakeServer()
        server.start(() => {
          server.on('error', (err) => {
            assert.ok(err)
            done()
          })
          server._sock.emit('error', 'wow')
        })
        server._sock.emit('listening')
      })

    })

  })

  var serverTestSuite = exports.serverTestSuite = (transport) => {

    describe('OSCServer - ' + transport, () => {

      it('should not cause problem with if starting/stopping several times', (done) => {
        var client = new oscTransport.createClient('127.0.0.1', 9001, transport)
          , server = new oscTransport.createServer(9001, transport)
          , messageHandler

        async.series([
          server.start.bind(server),

          (next) => {
            var _messageHandler = helpers.waitForAnswers(2, (received) => next(null, received))
            messageHandler = (address, args) => _messageHandler(1, address, args)
            server.on('message', messageHandler)
            client.send('/blabla', [1, 2, 3])
            client.send('/hello/helli', [])
          },

          server.stop.bind(server),
          server.stop.bind(server),
          server.start.bind(server),
          server.start.bind(server),

          (next) => {
            server.removeListener('message', messageHandler)
            var _messageHandler = helpers.waitForAnswers(1, (received) => next(null, received))
            messageHandler = (address, args) => _messageHandler(2, address, args)
            server.on('message', messageHandler)
            client.send('/bloblo', ['hello'])
          }

        ], (err, results) => {
          if (err) throw err
          results.shift()
          assert.deepEqual(results.shift(), [
            [1, '/blabla', [1, 2, 3]],
            [1, '/hello/helli', []]
          ])
          _(4).times(() => results.shift())
          assert.deepEqual(results.shift(), [
            [2, '/bloblo', ['hello']]
          ])
          server.stop(done)
        })
      })

      it('should start the server and be able to receive', (done) => {
        var server = new oscTransport.createServer(9001, transport)
          , client = new oscTransport.createClient('127.0.0.1', 9001, transport)
          , messageHandler

        messageHandler = helpers.waitForAnswers(2, (received) => {
          assert.deepEqual(received, [
            ['/blabla', [1, 2, 3]],
            ['/hello/helli', []],
          ])
          server.stop(done)
        })
        server.on('message', (address, args) => messageHandler(address, args))

        server.start((err) => {
          if (err) throw err
          client.send('/blabla', [1, 2, 3])
          client.send('/hello/helli', [])
        })
      })

      it('should return an error in callback if starting twice servers on same port', (done) => {
        var server1 = new oscTransport.createServer(9001, transport)
          , server2 = new oscTransport.createServer(9001, transport)

        server1.start((err) => {
          if (err) throw err
          server2.start((err) => {
            assert.ok(err)
            done()
          })
        })
      })

    })

  }
  serverTestSuite('udp')
  serverTestSuite('tcp')


  var clientTestSuite = exports.clientTestSuite = (transport, extra) => {

    describe('OSCClient - ' + transport, () => {

      it('should send small buffers', (done) => {
        var client = new oscTransport.createClient('127.0.0.1', 4444, transport)
          , buf = new Buffer(10)
        assertBufferGetSent(client, buf, (err, rBuf) => {
          if (err) throw err
          assert.deepEqual(buf, rBuf)
          done()
        })
      })

      it('should close properly', (done) => {
        var client = new oscTransport.createClient('127.0.0.1', 4444, transport)
          , buf = new Buffer(10)

        async.parallel([
          assertBufferGetSent.bind(this, client, buf),
          (next) => client.on('close', next),
          (next) => client.on('_sendsAllDone', next)
        ], done)
        client.close()
      })

      if (extra) extra()

    })

  }

  clientTestSuite('udp', () => {

    it('should fail to send big buffers', (done) => {
      var client = new oscTransport.createClient('127.0.0.1', 4444, 'udp')
        , buf = new Buffer(Math.pow(2, 16))
        , server

      client.on('error', (err) => {
        assert.equal(err.code, 'EMSGSIZE')
        done()
      })

      server = assertBufferGetSent(client, buf, (err, rBuf) => {
        if (err) throw err
        done(new Error('shouldnt come here'))
      })
    })

  })

  clientTestSuite('tcp', () => {

    it('should send big buffers', (done) => {
      var client = new oscTransport.createClient('127.0.0.1', 4444, 'tcp')
        , buf = new Buffer(Math.pow(2, 16))
      assertBufferGetSent(client, buf, (err, rBuf) => {
        if (err) throw err
        assert.deepEqual(buf, rBuf)
        done()
      })
    })

  })


})


var assertBufferGetSent = exports.assertBufferGetSent = function(client, buf, done) {
  var server = new oscTransport.createServer(client.port, client.transport)
  async.waterfall([
    server.start.bind(server),

    (next) => {
      server.once('message', (address, args) => {
        assert.equal(address, '/someBuffer')
        assert.equal(args.length, 1)
        next(null, args[0])
      })
      client.send('/someBuffer', [buf])
    },

    (buf, next) => {
      server.stop((err) => next(err, buf))
    }

  ], done)
  return server
}