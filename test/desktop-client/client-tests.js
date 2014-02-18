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
    id: 1,
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
    helpers.afterEach(done)
  })

  describe('receive blob', function() {

    it('should save the blob and send a message to the app client (Pd, Processing...)', function(done) {

      helpers.dummyOSCClients(2, [clientConfig.client], function(received) {
        // We collect the filePaths so that we can open them and replace the filepath
        // by the actual content of the file in our test. 
        var filePaths = _.chain(received).pluck(2).reduce(function(all, args, i) {
          args.forEach(function(arg, j) {
            if (/\/tmp.*/.exec(arg)) all.push([i, j, arg])
          })
          return all
        }, []).value()

        // Open all the files, and replace the filePaths with the actual file content for test purpose.
        async.series(filePaths.map(function(filePath) {
          return function(next) { fs.readFile(filePath[2], next) }
        }), function(err, results) {
          if (err) throw err
          results.forEach(function(contents, i) {
            received[filePaths[i][0]][2][filePaths[i][1]] = results[i]
          })
          helpers.assertSameElements(received, [
            [1, '/bla/blob', [new Buffer('blabla'), 'holle', 12345, new Buffer('bloblo')]],
            [1, '/', [56789, new Buffer('hihihi')]]
          ])
          done()
        })
      })

      sendToDesktopClient.send('/bla/blob', [new Buffer('blabla'), 'holle', 12345, new Buffer('bloblo')])
      sendToDesktopClient.send('/', [56789, new Buffer('hihihi')])
    })

  })

  describe('send blob', function() {

    it('should send a blob to the server', function(done) {
      var received = []

      fakeServer.on('message', function(address, args) {

        // The protocol for sending a blob from the app to the server goes like this :
        //    APP                SERVER            DESKTOP-CLIENT
        //    sendBlobAddress ->
        //                    sendBlobAddress ->
        //                                      <-   /some/address <blob>, <arg1>, >arg2>, ...
        if (address === shared.sendBlobAddress)
          sendToDesktopClient.send(shared.sendBlobAddress, args)

        else {
          received.push([address, args])
          if (received.length === 3) {
            helpers.assertSameElements(received, [
              ['/bla/bli', [new Buffer('blobbyA'), 1234, 'blabla']],
              ['/blo/', [new Buffer('blobbyB')]],
              ['/BLO/b/', [new Buffer('blobbyC'), 5678]]
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
        sendToServer.send(shared.sendBlobAddress, ['/bla/bli', '/tmp/blob1', 1234, 'blabla'])
        sendToServer.send(shared.sendBlobAddress, ['/blo/', '/tmp/blob2'])
        sendToServer.send(shared.sendBlobAddress, ['/BLO/b/', '/tmp/blob3', 5678])
      })
    })

    it('should refuse to send a blob that is not in the configured dirName', function(done) {
      fakeServer.on('message', function(address, args) {
        assert.equal(address, shared.errorAddress)
        done()
      })
      sendToDesktopClient.send(shared.sendBlobAddress, ['/bla', '/home/spiq/secret_file'])
    })

  })

})
