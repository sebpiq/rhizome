var _ = require('underscore')
  , shared = require('../shared')
  , sendJSON = shared.sendJSON
  , EventEmitter = require('events').EventEmitter
  , config = require('../../config')
  , WebSocket = typeof window !== 'undefined' ? window.WebSocket : require('ws')
  , Blob = typeof window !== 'undefined' ? window.Blob : function() {}
_.extend(exports, new EventEmitter)

var socket, nsTree

exports.userId = null

exports.start = function(opts, done) {
  if (arguments.length === 1) {
    if (_.isFunction(arguments[0])) {
      done = arguments[0]
      opts = {}
    }
  }
  _.defaults(opts || {}, {retry: 1000})

  if (socket) forgetSocket()

  nsTree = shared.createNsTree({
    createData: function(address) { return { handlers: [] } }
  })

  createSocket(done)

  if (opts.retry) {
    var retry = function() {
      createSocket(function(err) {
        if (err) throw err // TODO : better err handling
        nsTree.get('/').forEach(function(ns) {
          listenRegister(ns.address, function(err) {
            if (err) throw err // TODO : better err handling
          })
        })
        _waitEvent('close', function(event) { setTimeout(retry, opts.retry) })
      })
    }
    _waitEvent('close', function(event) { setTimeout(retry, opts.retry) })
  }
}

exports.stop = function(done) {
  if (socket) {
    forgetSocket()
    if (socket.readyState !== socket.CLOSED) {
      _waitEvent('close', function() {
        if (done) done(null)
      })
    } else if (done) done()
  } else if (done) done()
}

exports.listen = function(address, handler, done) {
  if (!socket) return _cbOrThrow(done, 'you must start the client before you can listen')

  // If the namespace doesn't exist yet, we need to create it first and then listen
  // to messages sent at this address by the server.
  if (!nsTree.has(address)) {
    listenRegister(address, function(err) {
      nsTree.get(address).data.handlers.push(handler)
      if (done) done(err)
    })

  // Otherwise, if the client is already listening, we just need to add an extra handler
  } else {
    nsTree.get(address).data.handlers.push(handler)
    if (done) done(null)
  }
}

var listenRegister = function(address, done) {
  sendJSON(socket, {command: 'listen', address: address})
  _waitCommand('listen', function(msg) {
    if (msg.status === 0) {
      if (done) done(null)
    } else return _cbOrThrow(done, msg.error)
  })
}

var createSocket = function(done) {
  socket = new WebSocket(config.websocket.url)

  socket.addEventListener('message', function(event) {
    if (event.data instanceof Blob) 1//TODO this.emit('blob', event.data)
    else {
      var msg = JSON.parse(event.data)
      if (msg.command === 'message') {
        exports.debug('message received')
        nsTree.get(msg.address, function(ns) {
          _.forEach(ns.data.handlers, function(handler) {
            handler(msg.address, msg.args)
          })
        })
      }
    }
  }, false)

  socket.addEventListener('open', function(event) {
    exports.debug('connected with server')
  
    _waitCommand('connect', function(msg) {
      if (msg.status === 0) {
        exports.userId = msg.userId
        if (done) done(null)
      } else if (msg.status === 1) _cbOrThrow(done, msg.error)
    })

  }, false)

  socket.addEventListener('error', function(event) {
    exports.debug('socket error')
  }, false)

  socket.addEventListener('close', function(event) {
    exports.userId = null
    socket = null
    exports.debug('socket closed')
  }, false)
}

var forgetSocket = function() {
  socket.close()
}

var _waitCommand = function(command, handler) {
  _waitEvent('message', function(event) {
    if (!(event.data instanceof Blob)) {
      var msg = JSON.parse(event.data)
      if (msg.command === command) {
        handler.call(this, msg)
        return true
      }
    }
    return false
  })
}

var _waitEvent = function(name, handler) {
  var _handler = function(event) {
    if (handler.call(this, event)) socket.removeEventListener(name, _handler, false)
  }
  socket.addEventListener(name, _handler, false)
}

var _cbOrThrow = function(done, err) {
  if (!(err instanceof Error)) err = new Error(err)
  if (done) done(err)
  else throw err
}

exports.debug = function(msg) { if (exports.DEBUG) console.log.apply(console, arguments) }
exports.DEBUG = false
