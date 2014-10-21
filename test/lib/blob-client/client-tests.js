var _ = require('underscore')
  , fs = require('fs')
  , async = require('async')
  , assert = require('assert')
  , shared = require('../../../lib/shared')
  , client = require('../../../lib/blob-client/client')
  , utils = require('../../../lib/server/core/utils')
  , oscCore = require('../../../lib/server/core/osc-core')
  , helpers = require('../../helpers')


var clientConfig = {
  blobsPort: 44444,
  blobsDirName: '/tmp',

  server: {
    ip: '127.0.0.1',
    blobsPort: 44445
  }
}

var sendToBlobClient = new oscCore.createOSCClient('localhost', clientConfig.blobsPort, 'tcp')
  , fakeServer = new oscCore.createOSCServer(clientConfig.server.blobsPort, 'tcp')
  , sendToServer = new oscCore.createOSCClient(clientConfig.server.ip, clientConfig.server.blobsPort, 'tcp')


describe('blob-client', function() {

  beforeEach(function(done) {
    async.series([
      client.start.bind(client, clientConfig), 
      fakeServer.start.bind(fakeServer)
    ], done)
  })

  afterEach(function(done) {
    async.series([
      fakeServer.stop.bind(fakeServer),
      helpers.afterEach
    ], done)
  })

  describe('receive blob', function() {

    it('should save the blob and send a message to the app client (Pd, Processing...)', function(done) {
      var bigBuf = new Buffer(Math.pow(2, 15))
        , oscClients = [
          { appPort: 9001 },
          { appPort: 9002 }
        ]

      helpers.dummyOSCClients(2, oscClients, function(received) {
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
            [9001, '/bla/blob', [bigBuf, 'holle', 12345, new Buffer('bloblo')]],
            [9001, '/', [56789, new Buffer('hihihi')]]
          ])
          done()
        })
      })

      sendToBlobClient.send('/bla/blob', [9001, bigBuf, 'holle', 12345, new Buffer('bloblo')])
      sendToBlobClient.send('/', [9001, 56789, new Buffer('hihihi')])
    })

    it('should save the blob with the given extension', function(done) {
      var oscClients = [ { appPort: 9001 } ]

      async.series([
        client.stop.bind(client),
        client.start.bind(client, _.extend({}, clientConfig, { fileExtension: '.wav' })),

        function(next) {
          helpers.dummyOSCClients(1, oscClients, function(received) {
            var filePath = received[0][2][0]
            received[0][2][0] = null
            helpers.assertSameElements(received, [
              [9001, '/bla/blob', [null, 111]]
            ])
            assert.equal(filePath.slice(-4), '.wav')
            done()
          })

          sendToBlobClient.send('/bla/blob', [9001, new Buffer('bloblo'), 111])
        }
      ])
    })

  })

  describe('send blob', function() {

    it('should send a blob to the server', function(done) {
      var received = []
        , bigBuf = new Buffer(Math.pow(2, 15))

      fakeServer.on('message', function(address, args) {

        if (address === shared.sendBlobAddress) {
          sendToBlobClient.send(shared.sendBlobAddress, args)

        } else {
          received.push([address, args])
          if (received.length === 3) {
            helpers.assertSameElements(received, [
              ['/bla/bli', [bigBuf, 1234, 'blabla']],
              ['/blo/', [new Buffer('blobbyB')]],
              ['/BLO/b/', [new Buffer('blobbyC'), 5678]]
            ])
            fakeServer.stop(done)
          }
        }
      })

      async.series([
        fs.writeFile.bind(fs, '/tmp/blob1', bigBuf),
        fs.writeFile.bind(fs, '/tmp/blob2', 'blobbyB'),
        fs.writeFile.bind(fs, '/tmp/blob3', 'blobbyC')
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
      sendToBlobClient.send(shared.sendBlobAddress, ['/bla', '/home/spiq/secret_file'])
    })

  })

})
