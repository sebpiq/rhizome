var fs = require('fs')
  , assert = require('assert')
  , _ = require('underscore')
  , async = require('async')
  , utils = require('../../../lib/server/utils')
  , helpers = require('../../helpers')

describe('utils', function() {
  
  describe('IdManager', function() {

    it('should assign the first free id', function() {
      var idManager = new utils.IdManager(5)
      assert.equal(idManager.get(), 0)
      assert.equal(idManager.get(), 1)
      assert.equal(idManager.get(), 2)
      assert.equal(idManager.get(), 3)
      assert.equal(idManager.get(), 4)
      assert.equal(idManager.get(), null)
    })

    it('should reassign free ids', function() {
      var idManager = new utils.IdManager(5)
      assert.equal(idManager.get(), 0)
      assert.equal(idManager.get(), 1)
      assert.equal(idManager.get(), 2)
      assert.equal(idManager.get(), 3)
      assert.equal(idManager.get(), 4)

      idManager.free(1)
      idManager.free(3)

      assert.equal(idManager.get(), 1)
      assert.equal(idManager.get(), 3)
      assert.equal(idManager.get(), null)

      idManager.free(2)
      idManager.free(0)
      assert.equal(idManager.get(), 0)
      assert.equal(idManager.get(), 2)
      assert.equal(idManager.get(), null)

      idManager.free(4)
      idManager.free(0)
      assert.equal(idManager.get(), 0)
      assert.equal(idManager.get(), 4)
      assert.equal(idManager.get(), null)
    })

    it('shouldn\'t free unknown ids', function() {
      var idManager = new utils.IdManager(5)
      assert.equal(idManager.get(), 0)
      assert.equal(idManager.get(), 1)
      assert.equal(idManager.get(), 2)

      idManager.free(null)
      idManager.free('a')
      assert.deepEqual(idManager.ids, [0, 1, 2])
    })

  })

  describe('getFreeFilePath', function() {
    
    var symLinked = '/tmp/1234'
    after(function(done) {
      var series = _.range(Math.pow(2, 8)).map(function(ind) {
        var filePath = '/tmp/' + ind.toString(10)
        return function(next) { fs.unlink(filePath, next) }
      })
      series.push(function(next) { fs.unlink(symLinked, next) })
      async.series(series, done)
    })

    it('should pick a filepath that doesn\'t exist and create an empty file', function(done) {
      utils.getFreeFilePath('/tmp', function(err, path) {
        if (err) throw err
        assert.ok(path.length > 4)
        done()
      })
    })

    it('should fail if there is not file path available', function(done) {
      // We make so that there is no file path available.
      // For this we create all the filepaths possibles (except one : /tmp/255), symlinks and real files.
      var series = _.range(Math.pow(2, 8) - 1).map(function(ind) {
        var filePath = '/tmp/' + ind.toString(10)
        return function(next) {
          if (Math.random() < 0.5) fs.symlink(symLinked, filePath, next)
          else fs.writeFile(filePath, '', next)
        }
      })
      // We also create the file we symlink
      series.unshift(function(next) { fs.writeFile(symLinked, '', next) })
      // The try to get a free filename ... which should fail
      series.push(function(next) {
        utils.getFreeFilePath('/tmp', function(err, path) {
          if (err) throw err
          assert.equal(path, '/tmp/255')
          next()
        }, 1)
      })
      async.series(series, done)
    })

  })

  describe('saveBlob', function() {

    it('should save the blob in the given directory and pick a name automatically', function(done) {
      var buf = new Buffer('blabla')

      async.waterfall([
        function(next) { utils.saveBlob('/tmp', buf, next) },
        function(filePath, next) { fs.readFile(filePath, next) }
      ], function(err, readBuf) {
        if (err) throw err
        assert.equal(readBuf.toString(), 'blabla')
        done()
      })

    })

  })

  describe('OSCServer', function() {

    describe('start/stop', function () {

      it('should bind the socket and call the callback on done', function(done) {
        var server = new utils.OSCServer(9001)
          , client = new utils.OSCClient('127.0.0.1', 9001)
          , messageHandler

        messageHandler = helpers.waitForAnswers(2, function(received) {
          assert.deepEqual(received, [
            ['/blabla', [1, 2, 3]],
            ['/hello/helli', []],
          ])
          server.stop(done)
        })
        server.on('message', function(address, args) { messageHandler(address, args) })

        server.start(function(err) {
          if (err) throw err
          client.send('/blabla', [1, 2, 3])
          client.send('/hello/helli', [])
        })
      })

      it('should not cause problem if starting/stopping several times', function(done) {
        var server = new utils.OSCServer(9001)
          , client = new utils.OSCClient('127.0.0.1', 9001)
          , messageHandler

        async.series([
          server.start.bind(server),
          function(next) {
            var _messageHandler = helpers.waitForAnswers(2, function(received) { next(null, received) })
            messageHandler = function(address, args) { _messageHandler(1, address, args) }
            server.on('message', messageHandler)
            client.send('/blabla', [1, 2, 3])
            client.send('/hello/helli', [])
          },
          server.stop.bind(server),
          server.stop.bind(server),
          server.start.bind(server),
          server.start.bind(server),
          function(next) {
            server.removeListener('message', messageHandler)
            _messageHandler = helpers.waitForAnswers(1, function(received) { next(null, received) })
            messageHandler = function(address, args) { _messageHandler(2, address, args) }
            server.on('message', messageHandler)
            client.send('/bloblo', ['hello'])
          }
        ], function(err, results) {
          if (err) throw err
          results.shift()
          assert.deepEqual(results.shift(), [
            [1, '/blabla', [1, 2, 3]],
            [1, '/hello/helli', []]
          ])
          _(4).times(function() { results.shift() })
          assert.deepEqual(results.shift(), [
            [2, '/bloblo', ['hello']]
          ])
          server.stop(done)
        })
      })

      it('should throw an error if starting twice servers on same port', function(done) {
        var server1 = new utils.OSCServer(9001)
          , server2 = new utils.OSCServer(9001)

        server1.start(function(err) {
          if (err) throw err
          server2.start(function(err) {
            assert.ok(err)
            done()
          })
        })
      })

    })

  })
  
})
