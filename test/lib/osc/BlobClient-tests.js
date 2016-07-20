var _ = require('underscore')
  , fs = require('fs')
  , async = require('async')
  , assert = require('assert')
  , coreMessages = require('../../../lib/core/messages')
  , BlobClient = require('../../../lib/osc/BlobClient')
  , oscTransport = require('../../../lib/osc/transport')
  , connections = require('../../../lib/connections')
  , helpers = require('../../helpers-backend')


var clientConfig = {
  blobsPort: 44444,
  blobsDir: '/tmp',
  serverHostname: '127.0.0.1',
  serverBlobsPort: 44445
}


var sendToBlobClient = new oscTransport.createClient('localhost', clientConfig.blobsPort, 'tcp')
  , fakeServer = new oscTransport.createServer(clientConfig.serverBlobsPort, 'tcp')
  , sendToServer = new oscTransport.createClient(clientConfig.serverHostname, clientConfig.serverBlobsPort, 'tcp')
  , client = new BlobClient(clientConfig)


describe('blob-client', function() {
  var manager = new connections.ConnectionManager({
    store: new connections.NoStore()
  })

  beforeEach(function(done) {
    connections.manager = manager
    async.series([
      client.start.bind(client), 
      manager.start.bind(manager),
      fakeServer.start.bind(fakeServer)
    ], done)
  })

  afterEach(function(done) {
    async.series([
      fakeServer.stop.bind(fakeServer),
      helpers.afterEach.bind(helpers, [client, manager])
    ], done)
  })

  describe('start', function() {

    it('should return ValidationError if config is not valid', function(done) {
      helpers.assertConfigErrors([
        [new BlobClient({blobsDir: '/IdontExist'}), ['.blobsDir']]
      ], done)
    })

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
        , blobClient = new BlobClient(_.extend({}, clientConfig, { fileExtension: '.wav' }))

      async.waterfall([
        client.stop.bind(client),
        blobClient.start.bind(blobClient),

        function(next) {
          helpers.dummyOSCClients(1, oscClients, function(received) { next(null, received) })
          sendToBlobClient.send('/bla/blob', [9001, new Buffer('bloblo'), 111])
        },

        function(received, next) {
          var filePath = received[0][2][0]
          received[0][2][0] = null
          helpers.assertSameElements(received, [
            [9001, '/bla/blob', [null, 111]]
          ])
          assert.equal(filePath.slice(-4), '.wav')
          next()
        },

        blobClient.stop.bind(blobClient)
      ], done)
    })

  })

  describe('send blob', function() {

    it('should send a blob to the server', function(done) {
      var received = []
        , bigBuf = new Buffer(Math.pow(2, 15))

      fakeServer.on('message', function(address, args) {

        if (address === coreMessages.sendBlobAddress) {
          sendToBlobClient.send(coreMessages.sendBlobAddress, args)

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
        sendToServer.send(coreMessages.sendBlobAddress, ['/bla/bli', '/tmp/blob1', 1234, 'blabla'])
        sendToServer.send(coreMessages.sendBlobAddress, ['/blo/', '/tmp/blob2'])
        sendToServer.send(coreMessages.sendBlobAddress, ['/BLO/b/', '/tmp/blob3', 5678])
      })
    })

    it('should refuse to send a blob that is not in the configured dirName', function(done) {
      fakeServer.on('message', function(address, args) {
        assert.equal(address, coreMessages.errorAddress)
        done()
      })
      sendToBlobClient.send(coreMessages.sendBlobAddress, ['/bla', '/home/spiq/secret_file'])
    })

  })

})
