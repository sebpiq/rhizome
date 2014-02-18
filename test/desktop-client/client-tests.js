var _ = require('underscore')
  , fs = require('fs')
  , async = require('async')
  , assert = require('assert')
  , shared = require('../../lib/shared')
  , client = require('../../lib/desktop-client/client')
  , utils = require('../../lib/server/utils')
  , helpers = require('../helpers')


var clientConfig = {

  server: {
    ip: '127.0.0.1',
    oscPort: 9000
  },

  client: {
    oscPort: 9001,
    desktopClientPort: 44444,
    blobsDirName: '/tmp'
  }

}

var sendToDesktopClient = new utils.OSCClient('localhost', clientConfig.client.desktopClientPort)
  , fakeApp = new utils.OSCServer(clientConfig.client.oscPort)
  , fakeServer = new utils.OSCServer(clientConfig.server.oscPort)
  , sendToServer = new utils.OSCClient(clientConfig.server.ip, clientConfig.server.oscPort)


describe('desktop-client', function() {

  before(function(done) {
    client.start(clientConfig, done)
  })

  afterEach(function(done) {
    fakeServer.removeAllListeners()
    fakeApp.removeAllListeners()
    helpers.afterEach(done)
  })

  describe('receive blob', function() {

    it('should save the blob and send a message to the final client (Pd, Processing...)', function(done) {
      var buf1 = new Buffer('blobby1')
        , buf2 = new Buffer('blobby2')
        , buf3 = new Buffer('blobby3')
        , received = []

      fakeApp.on('message', function (address, args, rinfo) {
        received.push([address, args])
        if (received.length === 3) {

          // Open all the files, and replace the filePaths with the actual file content for test purpose.
          async.series(received.map(function(msg) {
            return function(next) { fs.readFile(msg[1][0], next) }
          }), function(err, results) {
            if (err) throw err

            received.forEach(function(msg, i) { msg[1][0] = results[i].toString() })
            helpers.assertSameElements(received, [
              ['/bla/blob', ['blobby1', 0]],
              ['/blo/bli/blob/', [ 'blobby2', 0]],
              ['/blob', [ 'blobby3', 1]]
            ])
            done()
          })
        }
      })

      sendToDesktopClient.send(shared.fromWebBlobAddress, ['/bla/blob', buf1, 0])
      sendToDesktopClient.send(shared.fromWebBlobAddress, ['/blo/bli/blob/', buf2, 0])
      sendToDesktopClient.send(shared.fromWebBlobAddress, ['/blob', buf3, 1])
    })

  })

  describe('send blob', function() {

    it('should send a blob to the server', function(done) {
      var received = []

      fakeServer.on('message', function(address, args) {

        // The protocol for sending a blob from the app to the server goes like this :
        //    APP             SERVER                DESKTOP-CLIENT
        //    /bla/blob ->
        //                    gimmeBlobAddress ->
        //                            <-   fromDesktopBlobAddress
        if (shared.blobAddressRe.exec(address))
          sendToDesktopClient.send(shared.gimmeBlobAddress, [address, args[0]])

        else {
          received.push([address, args])
          if (received.length === 3) {
            received.forEach(function(r) { r[1][1] = r[1][1].toString() })
            helpers.assertSameElements(received, [
              [shared.fromDesktopBlobAddress, ['/bla/bli/blob', 'blobbyA']],
              [shared.fromDesktopBlobAddress, ['/blob/', 'blobbyB']],
              [shared.fromDesktopBlobAddress, ['/BLO/blob/', 'blobbyC']]
            ])
            done()
          }
        }
      })

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

    it('should refuse to send a blob that is not in the configured dirName', function(done) {
      fakeServer.on('message', function(address, args) {
        assert.equal(address, shared.errorAddress)
        done()
      })
      sendToDesktopClient.send(shared.gimmeBlobAddress, ['/bla', '/home/spiq/secret_file'])
    })

  })

})
