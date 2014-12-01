var assert = require('assert')
  , _ = require('underscore')
  , async = require('async')
  , WebSocket = require('ws')
  , moscow = require('moscow')
  , oscServer = require('../lib/osc/Server')
  , WebClient = require('../lib/websockets/Client')
  , webClient = new WebClient({ hostname: 'localhost', port: 8000 })
  , connections = require('../lib/connections')
  , coreServer = require('../lib/core/server')
  , coreMessages = require('../lib/core/messages')
  , ValidationError = require('../lib/core/errors').ValidationError
  , utils = require('../lib/core/utils')

// For testing : we need to add standard `removeEventListener` method cause `ws` doesn't implement it.
WebSocket.prototype.removeEventListener = function(name, cb) {
  var self = this
    , handlerList = this._events[name]
  handlerList = _.isFunction(handlerList) ? [handlerList] : handlerList
  this._events[name] = _.reject(handlerList, function(other) {
    return other._listener === cb
  })
}

// Helper to create dummy web clients
exports.dummyWebClients = function(wsServer, port, count, done) {
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

// Helper to create dummy osc clients
exports.dummyOSCClients = function(expectedMsgCount, clients, handler) {
  var answerReceived = waitForAnswers(expectedMsgCount, function() {
    var _arguments = arguments
    async.series(servers.map(function(server) {
      return server.stop.bind(server)
    }), function(err) {
      if (err) throw err 
      handler.apply(this, _arguments)
    })
  })

  var servers = clients.map(function(client, i) {
    var server = new moscow.createServer(client.appPort, client.transport || 'udp')
    server.start(function(err) { if (err) throw err })
    server.on('message', function(address, args) {
      answerReceived(client.appPort, address, args)
    })
    return server
  })
  return servers
}

// Helpers to create dummy server-side connections
var DummyConnection = exports.DummyConnection = function(callback) {
  this.callback = callback
  coreServer.Connection.apply(this)
}
_.extend(DummyConnection.prototype, coreServer.Connection.prototype, {
  send: function(address, args) { this.callback(address, args) }
})

exports.dummyConnections = function(expectedMsgCount, connectionCount, handler) {
  var answerReceived = waitForAnswers(expectedMsgCount, handler)
  return _.range(connectionCount).map(function(i) {
    return new DummyConnection(answerReceived.bind(this, i))
  })
}

// Helper for asynchronous tests, waiting for `expectedCount` answers and then calling `done`
var waitForAnswers = exports.waitForAnswers = function(expectedCount, done) {
  var received = []
  return function () {
    received.push(_.toArray(arguments))
    if (received.length >= expectedCount) done(received)
  }
}

// Helper with common operations to clean after a test
exports.afterEach = function(toStop, done) {
  if (arguments.length === 1) {
    done = toStop
    toStop = null
  }
  _dummyWebClients.forEach(function(socket) { socket.close() })
  _dummyWebClients = []
  connections.removeAll()
  if (toStop)
    async.series(toStop.map(function(obj) { return obj.stop.bind(obj) }), done)
  else done()
}

// Helper to assert that 2 arrays contain the same elements (using deepEqual)
exports.assertSameElements = function(arr1, arr2) {
  var sorted1 = _.sortBy(arr1, _sortFunc)
    , sorted2 = _.sortBy(arr2, _sortFunc)
  assert.deepEqual(sorted1, sorted2)
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

var assertValidationError = exports.assertValidationError = function(err, expected) {
  if (!(err instanceof ValidationError)) throw new Error('Expected ValidationError, got :' + err)
  var actual = _.keys(err.fields)
  actual.sort()
  expected.sort()
  assert.deepEqual(actual, expected)
}

exports.assertConfigErrors = function(testList, done) {
  async.forEach(testList, function(p, next) {
    var obj = p[0]
      , expected = p[1]
    obj.start(function(err) {
      assertValidationError(err, expected)
      next()
    })
  }, done)
}