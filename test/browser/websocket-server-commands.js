"use strict";
var assert = require('assert')
  , Buffer = require('buffer').Buffer
  , _ = require('underscore')
  , request = require('superagent')
  , oscMin = require('osc-min')

exports.config = {
  baseUrl: ''
}

exports.startServer = function(config, done) {
  done = done || function(err) { if (err) throw err }
  request
    .post(exports.config.baseUrl + '/server/start')
    .set('Content-Type', 'application/json')
    .send(config)
    .end(function(err) { done(err) })
}

exports.stopServer = function(config, done) {
  done = done || function(err) { if (err) throw err }
  request
    .post(exports.config.baseUrl + '/server/stop')
    .set('Content-Type', 'application/json')
    .send(config)
    .end(function(err) { done(err) })
}

exports.fillUpServer = function(done) {
  done = done || function(err) { if (err) throw err }
  request
    .post(exports.config.baseUrl + '/server/fill-up')
    .end(function(err) { done(err) })
}

exports.freeUpServer = function(done) {
  done = done || function(err) { if (err) throw err }
  request
    .post(exports.config.baseUrl + '/server/free-up')
    .end(function(err) { done(err) })
}

exports.kickOutClient = function(done) {
  done = done || function(err) { if (err) throw err }
  request
    .post(exports.config.baseUrl + '/server/kick-out')
    .end(function(err) { done(err) }) 
}

exports.sendMessage = function(address, args, done) {
  done = done || function(err) { if (err) throw err }
  request
    .post(exports.config.baseUrl + '/message/send')
    .set('Content-Type', 'text/plain')
    .send(oscMin.toBuffer({ address: address, args: args }).toString('binary'))
    .end(function(err) { done(err) })
}

exports.receiveMessage = function(addresses, done) {
  request
    .post(exports.config.baseUrl + '/message/receive')
    .set('Content-Type', 'application/json')
    .send(addresses)
    .end(function(err) { done(err) })
}

exports.fetchReceivedMessages = function(count, done) {
  var fetch = function() {
    request
      .get(exports.config.baseUrl + '/message/received')
      .end(function(err, res) {
        if (err) return done(err)
        var received = res.body
        if (received.length === count) {
          // Buffers are lost in the json transfer,
          // so for each arg if not string or number, we convert it to Buffer
          received.forEach(function(msg) {
            msg[2] = msg[2].map(function(arg) { 
              return typeof arg === 'object' ? new Buffer(arg) : arg
            })
          })
          done(null, received)
        } else setTimeout(fetch, 20)
      })
  }
  fetch()
}

exports.getNamespaceInfos = function(address, done) {
  request
    .get(exports.config.baseUrl + '/namespace/infos')
    .set('Content-Type', 'application/json')
    .query({ address: address })
    .end(function(err, res) {
      done(err, res.body)
    })
}

exports.assertConnected = function(client, done) {
  assert.equal(client.status(), 'started')
  assert.ok(_.isString(client.id) && client.id.length > 0)
  request
    .get(exports.config.baseUrl + '/server/connected')
    .end(function(err, res) {
      if (err) return done(err)
      assert.equal(res.body.count, 1)
      done()
    })
}

exports.assertDisconnected = function(client, done) {
  assert.equal(client.status(), 'stopped')
  assert.equal(client.id, null)
  done()
}
