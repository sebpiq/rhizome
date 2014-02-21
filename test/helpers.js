var assert = require('assert')
  , _ = require('underscore')
  , async = require('async')
  , WebSocket = require('ws')
  , wsServer = require('../lib/server/websockets')
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
      _dummies.push(socket)
      socket.addEventListener('open', function() { next() })
    }
  }), function(err) {
    assert.equal(wsServer.sockets().length, countBefore + count)
    done(err, _dummies)
  })
}
var _dummies = []

exports.dummyOSCClients = function(expectedMsgCount, clients, handler) {
  var received = []

  var _handler = function(address, args) {
    received.push([this.id, address, args])
    if (received.length >= expectedMsgCount) handler(received)
  }

  return clients.map(function(client, i) {
    var server = new utils.OSCServer(client.oscPort)
    server.on('message', _handler.bind({id: client.oscPort}))
    return server
  })
}

exports.dummyConnections = function(expectedMsgCount, connectionCount, handler) {
  var received = []

  var _handler = function(address, args) {
    received.push([this.id, address, args])
    if (received.length >= expectedMsgCount) handler(received)
  }

  return _.range(connectionCount).map(function(i) {
    return { send: _handler, id: i }
  })
}

// Helper with common operations to clean after a test
exports.afterEach = function(done) {
  _dummies.forEach(function() { socket.close() })
  _dummies = []
  connections.removeAll()
  async.series([ webClient.stop, wsServer.stop ], done)
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
