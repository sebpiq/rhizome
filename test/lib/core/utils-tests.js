var fs = require('fs')
  , assert = require('assert')
  , _ = require('underscore')
  , async = require('async')
  , helpers = require('../../helpers')
  , utils = require('../../../lib/core/utils')

describe('core.utils', function() {

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

    it('should create the file with the given extension', function(done) {
      utils.getFreeFilePath('/tmp', function(err, path) {
        if (err) throw err
        assert.ok(path.length > 4)
        assert.equal(path.slice(-4), '.wav')
        done()
      }, '.wav')
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
        }, '', 1)
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

    it('should save the blob with the given extension', function(done) {
      var buf = new Buffer('blabla')

      async.waterfall([
        function(next) { utils.saveBlob('/tmp', buf, next, '.wav') },
        function(filePath, next) {
          assert.equal(filePath.slice(-4), '.wav')
          fs.readFile(filePath, next)
        }
      ], function(err, readBuf) {
        if (err) throw err
        assert.equal(readBuf.toString(), 'blabla')
        done()
      })

    })

  })

  describe('NsTree', function() {

    describe('has', function() {

      it('should work correctly', function() {
        var nsTree = utils.createNsTree()
        nsTree._root = {children: {
          '': {address: '/', children: {
            'bla': {address: '/bla', children: {
              'blo': {address: '/bla/blo', children: {
                'bli': {address: '/bla/blo/bli', children: {}}
              }},
              'bly': {address: '/bla/bly', children: {}}
            }},
            'blu': {address: '/blu', children: {}}
          }}
        }}

        assert.ok(nsTree.has('/'))
        assert.ok(nsTree.has('/bla'))
        assert.ok(nsTree.has('/bla/bly'))
        assert.ok(nsTree.has('/bla/blo'))
        assert.ok(nsTree.has('/bla/blo/bli'))
        assert.ok(nsTree.has('/blu'))
      })
    })

    describe('get', function() {

      it('should create the namespace dynamically', function() {
        var nsTree = utils.createNsTree()

        assert.ok(!nsTree.has('/'))
        assert.ok(!nsTree.has('/bla'))
        assert.deepEqual(nsTree.get('/bla'), { address: '/bla', connections: [], lastMessage: null, children: {} })
        assert.ok(nsTree.has('/'))
        assert.ok(nsTree.has('/bla'))

        assert.ok(!nsTree.has('/bla/blo/bli'))
        assert.ok(!nsTree.has('/bla/blo'))
        assert.deepEqual(nsTree.get('/bla/blo/bli'), { address: '/bla/blo/bli', connections: [], lastMessage: null, children: {} })
        assert.ok(nsTree.has('/bla/blo/bli'))
        assert.ok(nsTree.has('/bla/blo'))
      })

      it('should work also for the root', function() {
        var nsTree = utils.createNsTree()

        assert.ok(!nsTree.has('/'))
        assert.deepEqual(nsTree.get('/'), { address: '/', connections: [], lastMessage: null, children: {} })
        assert.ok(nsTree.has('/'))

        assert.deepEqual(nsTree._root.children, {'': { address: '/', connections: [], lastMessage: null, children: {} }})
      })

      it('shouldn\'t make a difference whether there is trailing slash or not', function() {
        var nsTree = utils.createNsTree()
        assert.equal(nsTree.get('/bla'), nsTree.get('/bla/'))
      })

    })

    describe('toJSON', function() {

      it('should serialize the tree', function() {
        var nsTree = utils.createNsTree()
        nsTree.get('/bla/bli').lastMessage = ['lolo']
        nsTree.get('/bla').lastMessage = [1, 2, 'boo']
        nsTree.get('/blo')
        helpers.assertSameElements(nsTree.toJSON(), [
          { address: '/', lastMessage: null },
          { address: '/bla', lastMessage: [1, 2, 'boo'] },
          { address: '/bla/bli', lastMessage: ['lolo'] },
          { address: '/blo', lastMessage: null }
        ])
      })

    })

    describe('fromJSON', function() {

      it('should deserialize the tree', function() {
        var nsTree = utils.createNsTree()
        nsTree.fromJSON([
          { address: '/', lastMessage: null },
          { address: '/blu', lastMessage: [1, 2, 'boo'] },
          { address: '/bla/bli', lastMessage: ['lolo'] },
          { address: '/blo', lastMessage: null }
        ])

        assert.equal(nsTree.has('/'), true)
        assert.equal(nsTree.has('/blu'), true)
        assert.equal(nsTree.has('/bla'), true)
        assert.equal(nsTree.has('/bla/bli'), true)
        assert.equal(nsTree.has('/blo'), true)

        assert.equal(nsTree.get('/').lastMessage, null)
        assert.deepEqual(nsTree.get('/blu').lastMessage, [1, 2, 'boo'])
        assert.equal(nsTree.get('/bla').lastMessage, null)
        assert.deepEqual(nsTree.get('/bla/bli').lastMessage, ['lolo'])
        assert.equal(nsTree.get('/blo').lastMessage, null)
      })

    })

  })

  describe('NsNode', function() {

    describe('forEach', function() {

      it('should iterate over all namespaces no matter depth', function() {
        var nsTree = utils.createNsTree()
          , allData = []
          , iter = function(ns) { allData.push(ns.address) }

        var testIter = function(root, expected) {
          nsTree.get(root).forEach(iter)
          assert.deepEqual(allData, expected)
          allData = []
        }

        testIter('/', ['/'])
        testIter('/a', ['/a'])
        testIter('/', ['/', '/a'])

        nsTree.get('/a/b')
        nsTree.get('/a/c')
        testIter('/a', ['/a', '/a/b', '/a/c'])

        nsTree.get('/a/c/d')
        nsTree.get('/a/c/e')
        nsTree.get('/f')
        testIter('/', ['/', '/a', '/a/b', '/a/c', '/a/c/d', '/a/c/e', '/f'])
      })

    })

  })

  describe('Queue', function() {

    describe('add', function() {

      it('should put the elem at the end of the queue', function() {
        var q = new utils.Queue()
        q.add(111)
        q.add(222)
        q.add(222)
        assert.equal(q.length, 2)
        assert.deepEqual(q.elements, [111, 222])
      })

    })

    describe('remove', function() {

      it('should remove the elements from the queue', function() {
        var q = new utils.Queue()
        q.add(111)
        q.add(222)
        q.add(222)
        q.add(333)
        assert.equal(q.length, 3)
        assert.deepEqual(q.elements, [111, 222, 333])

        q.remove(222)
        assert.equal(q.length, 2)
        assert.deepEqual(q.elements, [111, 333])

        q.remove(888)
        assert.equal(q.length, 2)
        assert.deepEqual(q.elements, [111, 333])

        q.remove(333)
        assert.equal(q.length, 1)
        assert.deepEqual(q.elements, [111])
      })

    })

    describe('pop', function() {

      it('should pop the oldest element from the queue', function() {
        var q = new utils.Queue()
        q.add(111)
        q.add(222)
        q.add(333)
        assert.equal(q.length, 3)
        assert.deepEqual(q.elements, [111, 222, 333])

        assert.equal(q.pop(), 111)
        assert.equal(q.length, 2)
        assert.deepEqual(q.elements, [222, 333])

        assert.equal(q.pop(), 222)
        assert.equal(q.length, 1)
        assert.deepEqual(q.elements, [333])

        assert.equal(q.pop(), 333)
        assert.equal(q.length, 0)
        assert.deepEqual(q.elements, [])

        assert.equal(q.pop(), null)
        assert.equal(q.length, 0)
        assert.deepEqual(q.elements, [])
      })

    })

  })

})
