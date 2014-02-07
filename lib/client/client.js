var _ = require('underscore')
  , shared = require('../shared')
  , sendJSON = shared.sendJSON
  , EventEmitter = require('events').EventEmitter
  , config = require('../../config.js')
  , WebSocket = typeof window !== 'undefined' ? window.WebSocket : require('ws')
  , Blob = typeof window !== 'undefined' ? window.Blob : function() {}
 
var socket = null
  , client = exports
_.extend(client, new EventEmitter)

client.namespaces = shared.createNsTree({

  createData: function(address) { return { handlers: [] } },

  mergeData: function(merged, data) {}

})

client.userId = null

client.start = function(opts) {
  _.defaults(opts, {retry: 1000, done: null})
  socket = new WebSocket(config.websocket.url)

  socket.addEventListener('message', function(event) {
    if (event.data instanceof Blob) 1//TODO this.emit('blob', event.data)
    else {
      var msg = JSON.parse(event.data)
      if (msg.command === 'message') {
        client.debug('message received')
        client.namespaces.get(msg.address, function(ns) {
          _.forEach(ns.data.handlers, function(handler) {
            handler(msg.address, msg.args)
          })
        })
      }
    }
  }, false)

  socket.addEventListener('open', function(event) {
    client.debug('connected with server')
  
    _waitCommand('connect', function(msg) {
      if (msg.status === 0) {
        client.userId = msg.userId
        if (opts.done) opts.done(null)
      } else if (msg.status === 1) _cbOrThrow(opts.done, msg.error)
    })

  }, false)

  socket.addEventListener('error', function(event) {
    client.debug('socket error')
  }, false)

  socket.addEventListener('close', function(event) {
    client.debug('socket closed')
    setTimeout(function() { client.start(url, opts.done) }, opts.retry)
  }, false)
}

client.listen = function(opts) {
  _.defaults(opts, {address: null, handler: null, done: null})
  if (!socket) return _cbOrThrow(done, 'you must start the client before you can listen')
  if (!opts.address) return _cbOrThrow(done, 'you must provide an address')
  if (!opts.handler) return _cbOrThrow(done, 'you must provide a handler')

  // If the namespace doesn't exist yet, we need to create it first and then listen
  // to messages sent at this address by the server.
  if (!client.namespaces.has(opts.address)) {
    sendJSON(socket, {command: 'listen', address: opts.address})
    _waitCommand('listen', function(msg) {
      if (msg.status === 0) {
        client.namespaces.get(opts.address).data.handlers.push(opts.handler)
        if (opts.done) opts.done(null)
      } else return _cbOrThrow(opts.done, msg.error)
    })

  // Otherwise, if the client is already listening, we just need to add an extra handler
  } else {
    client.namespaces.get(opts.address).data.handlers.push(opts.handler)
    if (opts.done) opts.done(null)
  }
}

var _waitCommand = function(command, handler) {
  var _handler = function(event) {
    if (!(event.data instanceof Blob)) {
      var msg = JSON.parse(event.data)
      if (msg.command === command) {
        socket.removeEventListener('message', _handler, false)
        handler.call(this, msg)
      }
    }
  }
  socket.addEventListener('message', _handler, false)
}

var _cbOrThrow = function(done, err) {
  if (!(err instanceof Error)) err = new Error(err)
  if (done) done(err)
  else throw err
}

client.debug = function(msg) { if (client.DEBUG) console.log.apply(console, arguments) }
client.DEBUG = false
