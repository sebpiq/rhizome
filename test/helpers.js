var assert = require('assert')
  , _ = require('underscore')
  , async = require('async')
  , WebSocket = require('ws')
  , wsServer = require('../lib/server/websockets')
  , oscServer = require('../lib/server/osc')
  , webClient = require('../lib/web-client/client')
  , connections = require('../lib/server/connections')
  , utils = require('../lib/server/utils')

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
exports.dummyWebClients = function(port, count, done) {
  var countBefore = wsServer.sockets().length
  async.series(_.range(count).map(function(i) {
    return function(next) {
      socket = new WebSocket('ws://localhost:' + port + '/?dummies')
      _dummyWebClients.push(socket)
      socket.addEventListener('open', function() { next() })
    }
  }), function(err) {
    assert.equal(wsServer.sockets().length, countBefore + count)
    if (done) done(err, _dummyWebClients)
  })
}
var _dummyWebClients = []

exports.dummyOSCClients = function(expectedMsgCount, clients, handler) {
  var answerReceived = waitForAnswers(expectedMsgCount, function() {
    servers.forEach(function(server) { server.close() })
    handler.apply(this, arguments)
  })

  var servers = clients.map(function(client, i) {
    var server = new utils.OSCServer(client.appPort)
    server.on('message', function(address, args) {
      answerReceived([client.appPort, address, args])
    })
    return server
  })
  return servers
}

exports.dummyConnections = function(expectedMsgCount, connectionCount, handler) {
  var answerReceived = waitForAnswers(expectedMsgCount, handler)
  return _.range(connectionCount).map(function(i) {
    return {send: function(address, args) {
      answerReceived([i, address, args])
    }}
  })
}

var waitForAnswers = exports.waitForAnswers = function(expectedCount, done) {
  var received = []
  return function (elem) {
    received.push(elem)
    if (received.length >= expectedCount) done(received)
  }
}

// Helper with common operations to clean after a test
exports.afterEach = function(done) {
  _dummyWebClients.forEach(function() { socket.close() })
  _dummyWebClients = []
  connections.removeAll()
  async.series([ webClient.stop, wsServer.stop, oscServer.stop ], done)
}

// Helper to assert that 2 arrays contain the same elements (using deepEqual)
exports.assertSameElements = function(arr1, arr2) {
  assert.deepEqual(_.sortBy(arr1, _sortFunc), _.sortBy(arr2, _sortFunc))
}
var _sortFunc = function(obj) {
  vals = obj
  if (_.isObject(obj)) {
    vals = _.chain(obj).pairs()
      .sortBy(function(p) { return p[0] })
      .pluck(1).value()
  }
  return vals.map(function(v) { return v.toString() }).join('')
}
