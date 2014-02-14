var _ = require('underscore')
  , fs = require('fs')
  , async = require('async')
  , assert = require('assert')
  , shared = require('../../lib/shared')
  , oscServer = require('../../lib/server/osc')
  , wsServer = require('../../lib/server/websockets')
  , client = require('../../lib/desktop-client/client')
  , utils = require('../../lib/server/utils')
  , helpers = require('../helpers')

var config = {

  server: {
    port: 8000,
    blobsDirName: '/tmp'
  },

  osc: {
    port: 9000,
    hostname: 'localhost',
    clients: [ {ip: 'localhost', port: 9001} ]
  },

  desktopClient: {
    port: 44444,
    blobsDirName: '/tmp'
  }

}

// This fakes the server
var sendToDesktopClient = new utils.OSCClient(config.osc.clients[0].ip, config.desktopClient.port)

// This fakes the performance system (Pd, processing)
var receiveFromServer = new utils.OSCServer(config.osc.clients[0].port)
  , sendToServer = new utils.OSCClient(config.osc.hostname, config.osc.port)


describe('desktop-client', function() {

  beforeEach(function(done) {
    receiveFromServer.removeAllListeners()
    async.series([
      function(next) { oscServer.start(config, next) },
      function(next) { wsServer.start(config, next) }
    ], done)
  })

  afterEach(function(done) {
    helpers.afterEach(done)
  })

  describe('receive blob', function() {

    beforeEach(function(done) {
      client.start(config, done)
    })

    it('should save the blob and send a message to the final client (Pd, Processing...)', function(done) {
      var buf1 = new Buffer('blobby1')
        , buf2 = new Buffer('blobby2')
        , buf3 = new Buffer('blobby3')
        , received = []

      receiveFromServer.on('message', function (address, args, rinfo) {
        received.push([address, args])
        if (received.length === 3) {

          // Open all the files, and replace the filePaths with the actual file content for test purpose.
          async.series(received.map(function(msg) {
            return function(next) { fs.readFile(msg[1][0], next) }
          }), function(err, results) {
            if (err) throw err

            received.forEach(function(msg, i) { msg[1][0] = results[i].toString() })
            helpers.assertSameElements(received, [
              ['/bla/blob', ['blobby1']],
              ['/blo/bli/blob/', [ 'blobby2' ]],
              ['/blob', [ 'blobby3' ]]
            ])
            done()
          })
        }
      })

      sendToDesktopClient.send(shared.takeBlobAddress, [config.osc.clients[0].port, '/bla/blob', buf1])
      sendToDesktopClient.send(shared.takeBlobAddress, [config.osc.clients[0].port, '/blo/bli/blob/', buf2])
      sendToDesktopClient.send(shared.takeBlobAddress, [config.osc.clients[0].port, '/blob', buf3])
    })

  })

  describe('send blob', function() {

    it('should send a blob to the server', function(done) {
      var received = []

      var receivedHandler = function(msg) {
        msg = JSON.parse(msg)
        received.push(msg)

        if (received.length === 4) {

          async.series(received.map(function(msg) {
            return function(next) { fs.readFile(msg.filePath, next) }
          }), function(err, results) {
            if (err) throw err
            
            received.forEach(function(r, i) {
              r.blob = results[i].toString()
              delete r.filePath
            })

            helpers.assertSameElements(received, [
              {command: 'blob', blob: 'blobbyA', address: '/bla/bli/blob'},
              {command: 'blob', blob: 'blobbyA', address: '/bla/bli/blob'},
              {command: 'blob', blob: 'blobbyB', address: '/blob/'},
              {command: 'blob', blob: 'blobbyC', address: '/BLO/blob/'}
            ])
            done()
          })
        }
      }

      // Dummy receivers
      wsServer.nsTree.get('/bla').data.sockets = [{ send: receivedHandler }]
      wsServer.nsTree.get('/').data.sockets = [{ send: receivedHandler }]

      async.series([
        function(next) { fs.writeFile('/tmp/blob1', 'blobbyA', next) },
        function(next) { fs.writeFile('/tmp/blob2', 'blobbyB', next) },
        function(next) { fs.writeFile('/tmp/blob3', 'blobbyC', next) },
      ], function(err) {
        if (err) throw err
        sendToServer.send('/bla/bli/blob', ['/tmp/blob1'])
        sendToServer.send('/blob/', ['/tmp/blob2'])
        sendToServer.send('/BLO/blob/', ['/tmp/blob3'])
      })
    })

  })

})
