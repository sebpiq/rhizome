var _ = require('underscore')
  , shared = require('../shared')
  , sendJSON = shared.sendJSON
  , EventEmitter = require('events').EventEmitter
  , config = require('../../config.js')
  , WebSocket = typeof window !== 'undefined' ? window.WebSocket : require('ws')
  , Blob = typeof window !== 'undefined' ? window.Blob : function() {}
 
var socket
  , nsTree

_.extend(exports, new EventEmitter)

exports.userId = null

exports.start = function(opts) {
  _.defaults(opts, {retry: 1000, done: null})

  if (socket) forgetSocket()

  nsTree = shared.createNsTree({
    createData: function(address) { return { handlers: [] } }
  })

  createSocket(opts.done)

  _waitEvent('close', function(event) {
    if (opts.retry) {
      setTimeout(function() {
        createSocket(function(err) {
          if (err) throw err // TODO : better err handling
          nsTree.get('/').forEach(function(ns) {
            listenRegister(ns.address, function(err) {
              if (err) throw err // TODO : better err handling
            })
          })
        })
      }, opts.retry)
    }
  })
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

exports.listen = function(opts) {
  _.defaults(opts, {address: null, handler: null, done: null})
  if (!socket) return _cbOrThrow(done, 'you must start the client before you can listen')
  if (!opts.address) return _cbOrThrow(done, 'you must provide an address')
  if (!opts.handler) return _cbOrThrow(done, 'you must provide a handler')

  // If the namespace doesn't exist yet, we need to create it first and then listen
  // to messages sent at this address by the server.
  if (!nsTree.has(opts.address)) {
    listenRegister(opts.address, function(err) {
      nsTree.get(opts.address).data.handlers.push(opts.handler)
      if (opts.done) opts.done(err)
    })

  // Otherwise, if the client is already listening, we just need to add an extra handler
  } else {
    nsTree.get(opts.address).data.handlers.push(opts.handler)
    if (opts.done) opts.done(null)
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
