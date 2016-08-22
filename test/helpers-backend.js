"use strict";
var querystring = require('querystring')
  , fs = require('fs')
  , _ = require('underscore')
  , async = require('async')
  , WebSocket = require('ws')
  , oscMin = require('osc-min')
  , rimraf = require('rimraf')
  , oscServer = require('../lib/osc/Server')
  , oscTransport = require('../lib/osc/transport')
  , connections = require('../lib/connections')
  , coreServer = require('../lib/core/server')
  , coreMessages = require('../lib/core/messages')
  , ValidationError = require('../lib/core/errors').ValidationError
  , utils = require('../lib/core/utils')
  , helpersEverywhere = require('./helpers-everywhere')
_.extend(exports, helpersEverywhere)

// The directory we use for storing persisted data in tests
var testDbDir = exports.testDbDir = '/tmp/rhizome-test-db'

// For testing : we need to add standard `removeEventListener` method cause `ws` doesn't implement it.
WebSocket.prototype.removeEventListener = function(name, cb) {
  var handlerList = this._events[name]
  handlerList = _.isFunction(handlerList) ? [handlerList] : handlerList
  this._events[name] = _.reject(handlerList, (other) => other._listener === cb)
}

// Helper to create dummy web clients. Callack is called only when sockets all opened.
exports.dummyWebClients = function(wsServer, clients, done) {
  var countBefore = wsServer._wsServer.clients.length 
    , url, socket, sockets = []
  async.series(clients.map((client) => {
    return (next) => {
      _.defaults(client, { query: {} })
      client.query.dummies = ''
      url = 'ws://localhost:' + client.port + '/?' + querystring.stringify(client.query)
      socket = new WebSocket(url)
      _dummyWebClients.push(socket)
      sockets.push(socket)

      socket.on('error', (err) => {
        console.error('dummy socket error : ' + err)
        throw err
      })
      
      socket.on('open', () => {
        socket.once('message', (msg) => {
          msg = oscMin.fromBuffer(msg)
          var args = _.pluck(msg.args, 'value')
          if (msg.address === coreMessages.connectionStatusAddress) next(null, args)
          else throw new Error('unexpected message ' + msg.address + ' ' + msg.args.join(', '))
        })
      })
    }
  }), (err, messages) => {
    if (done) done(err, sockets, messages)
  })
}
var _dummyWebClients = []

// Helper to create dummy osc clients, calls `handler` when these clients received `expectedMsgCount`
// messages from rhizome.
// NB : what we call "osc clients", are clients from rhizome's point of view, 
// therefore they are actually servers.
exports.dummyOSCClients = function(expectedMsgCount, clients, handler) {
  var answerReceived = exports.waitForAnswers(expectedMsgCount, function() {
    var _arguments = arguments
    async.eachSeries(servers, (server, next) => server.stop(next), (err) => {
      if (err) throw err
      handler.apply(this, _arguments)
    })
  })

  var servers = clients.map((client, i) => {
    var server = oscTransport.createServer(client.appPort, client.transport || 'udp')
    server.start((err) => { if (err) throw err })
    server.on('message', (address, args) => answerReceived(client.appPort, address, args))
    return server
  })
  return servers
}

// DummyServer and DummyConnection classes that simulate all core.server functionalities.
// Args: [<on message callback>, <connection id>]
var DummyConnection = exports.DummyConnection = function(args) {
  coreServer.Connection.call(this)
  this.callback = args[0]
  this.id = args[1]
}
_.extend(DummyConnection.prototype, coreServer.Connection.prototype, {
  namespace: 'dummy',
  autoId: false,
  send: function(address, args) { this.callback(address, args) },
  serialize: function() { return this.testData || {} },
  deserialize: function(data) { 
    coreServer.Connection.prototype.deserialize.call(this, data)
    this.restoredTestData = data 
  }
})

var DummyServer = exports.DummyServer = function() {
  coreServer.Server.apply(this)
}
_.extend(DummyServer.prototype, coreServer.Server.prototype, {
  ConnectionClass: DummyConnection
})

// Common tasks to be executed before all tests
exports.beforeEach = function(toStart, done) {
  var asyncOps = [
    rimraf.bind(rimraf, testDbDir),
    fs.mkdir.bind(fs, testDbDir)
  ], manager = _.find(toStart, (s) => s instanceof connections.ConnectionManager)

  if (arguments.length === 1) {
    done = toStart
    toStart = []
  }

  if (manager)
    connections.manager = manager

  if (toStart.length) 
    toStart.forEach((obj) => asyncOps.push(obj.start.bind(obj)))

  if (asyncOps.length) 
    async.series(asyncOps, done)
  else done()
}

// Common tasks to be executed after all tests
exports.afterEach = function(toStop, done) {
  var asyncOps = []

  if (arguments.length === 1) {
    done = toStop
    toStop = []
  }

  if (_dummyWebClients.length) {
    asyncOps.push((next) => {
      async.eachSeries(_dummyWebClients, (socket, nextSocket) => {
        socket.removeAllListeners()
        if (socket.readyStatus === WebSocket.OPEN) {
          socket.close()
          socket.once('close', nextSocket)
        } else nextSocket()
      }, (err) => {
        _dummyWebClients = []
        next(err)
      })
    })
  }

  if (toStop.length) 
    toStop.forEach((obj) => asyncOps.push(obj.stop.bind(obj)))
  
  if (asyncOps.length) 
    async.series(asyncOps, done)
  else done()
}