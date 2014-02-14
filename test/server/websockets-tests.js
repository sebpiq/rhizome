var _ = require('underscore')
  , fs = require('fs')
  , async = require('async')
  , assert = require('assert')
  , wsServer = require('../../lib/server/websockets')
  , oscServer = require('../../lib/server/osc')
  , webClient = require('../../lib/web-client/client')
  , utils = require('../../lib/server/utils')
  , helpers = require('../helpers')

var config = {
    server: { port: 8000, rootUrl: '/', usersLimit: 40, blobsDirName: '/tmp' },
    osc: { port: 9000, hostname: 'localhost', clients: [] },
    desktopClient: { port: 66666 }
  }


describe('websockets', function() {

  afterEach(function(done) { helpers.afterEach(done) })

  describe('disconnections, server', function() {

    beforeEach(function(done) {
      webClient.config.reconnect = 0
      wsServer.start(config, done)
    })

    it('should forget the socket', function(done) {
      assert.equal(wsServer.sockets().length, 0)
      assert.equal(webClient.status(), 'stopped')
      async.series([
        function(next) { helpers.dummyConnections(config, 2, next) },
        function(next) { webClient.start(next) },
        function(next) {
          webClient.listen('/someAddr', function() {}, function(err) {
            assert.equal(wsServer.nsTree.get('/someAddr').data.sockets.length, 1)
            next(err)
          }) 
        },
        function(next) {
          assert.equal(wsServer.sockets().length, 3)
          assert.equal(webClient.status(), 'started')
          webClient.stop(next)
        }
      ], function(err) {
        if (err) throw err
        assert.equal(wsServer.sockets().length, 2)
        assert.equal(webClient.status(), 'stopped')
        assert.equal(wsServer.nsTree.get('/someAddr').data.sockets.length, 0)
        done()
      })
    })

  })

})
