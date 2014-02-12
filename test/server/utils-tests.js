var fs = require('fs')
  , assert = require('assert')
  , _ = require('underscore')
  , async = require('async')
  , utils = require('../../lib/server/utils')

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
  
})
