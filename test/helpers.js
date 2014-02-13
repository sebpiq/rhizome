var assert = require('assert')
  , _ = require('underscore')
  , async = require('async')
  , WebSocket = require('ws')
  , wsServer = require('../lib/server/websockets')
  , webClient = require('../lib/web-client/client')

// For testing : we need to add standard `removeEventListener` method cause `ws` doesn't implement it.
WebSocket.prototype.removeEventListener = function(name, cb) {
  var self = this
    , handlerList = this._events[name]
  handlerList = _.isFunction(handlerList) ? [handlerList] : handlerList
  this._events[name] = _.reject(handlerList, function(other) {
    return other._listener === cb
  })
}

// Helper to create dummy connections from other clients
exports.dummyConnections = function(config, count, done) {
  var countBefore = wsServer.sockets().length
  async.series(_.range(count).map(function(i) {
    return function(next) {
      socket = new WebSocket('ws://localhost:' + config.server.port + '/?dummies')
      _dummies.push(socket)
      socket.addEventListener('open', function() { next() })
    }
  }), function(err) {
    assert.equal(wsServer.sockets().length, countBefore + count)
    done(err)
  })
}
var _dummies = []

exports.afterEach = function(done) {
  _dummies.forEach(function() { socket.close() })
  _dummies = []
  async.series([ webClient.stop, wsServer.stop ], done)
}
