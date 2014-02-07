var _ = require('underscore')
  , assert = require('assert')
  , createNsTree = require('../lib/shared').createNsTree

describe('Tree', function() {

  var meths = {
    createData: function() {
      return {data1: [1, 2, 3]}
    }
  }

  describe('has', function() {

    it('should work correctly', function() {
      var nsm = createNsTree(meths)
      nsm._root = {children: {
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

      assert.ok(nsm.has('/'))
      assert.ok(nsm.has('/bla'))
      assert.ok(nsm.has('/bla/bly'))
      assert.ok(nsm.has('/bla/blo'))
      assert.ok(nsm.has('/bla/blo/bli'))
      assert.ok(nsm.has('/blu'))
    })
  })

  describe('get', function() {

    it('should create the namespace dynamically', function() {
      var nsm = createNsTree(meths)

      assert.ok(!nsm.has('/'))
      assert.ok(!nsm.has('/bla'))
      assert.deepEqual(nsm.get('/bla'), { address: '/bla', data: {'data1': [1, 2, 3]}, children: {} })
      assert.ok(nsm.has('/'))
      assert.ok(nsm.has('/bla'))

      assert.ok(!nsm.has('/bla/blo/bli'))
      assert.ok(!nsm.has('/bla/blo'))
      assert.deepEqual(nsm.get('/bla/blo/bli'), { address: '/bla/blo/bli', data: {'data1': [1, 2, 3]}, children: {} })
      assert.ok(nsm.has('/bla/blo/bli'))
      assert.ok(nsm.has('/bla/blo'))
    })

    it('should work also for the root', function() {
      var nsm = createNsTree(meths)

      assert.ok(!nsm.has('/'))
      assert.deepEqual(nsm.get('/'), { address: '/', data: {'data1': [1, 2, 3]}, children: {} })
      assert.ok(nsm.has('/'))

      assert.deepEqual(nsm._root.children, {'': { address: '/', data: {data1: [1, 2, 3]}, children: {} }})
    })

  })

  describe('normalize', function() {
    
    var nsm = createNsTree(meths) 

    it('should remove trailing slash', function() {
      assert.equal(nsm.normalize('/'), '/')
      assert.equal(nsm.normalize('/bla'), '/bla')
      assert.equal(nsm.normalize('/bla/blo'), '/bla/blo')
      assert.equal(nsm.normalize('/bla/'), '/bla')
      assert.equal(nsm.normalize('/bla/blo/'), '/bla/blo')
    })

  })

})

describe('Node', function() {

  describe('forEach', function() {

    it('should iterate over all namespaces no matter depth', function() {
      var nsm = createNsTree({createData: function() { return this.address }})
        , allData = []
        , iter = function(ns) { allData.push(ns.data) }

      var testIter = function(root, expected) {
        nsm.get(root).forEach(iter)
        assert.deepEqual(allData, expected)
        allData = []
      }

      testIter('/', ['/'])
      testIter('/a', ['/a'])
      testIter('/', ['/', '/a'])

      nsm.get('/a/b')
      nsm.get('/a/c')
      testIter('/a', ['/a', '/a/b', '/a/c'])

      nsm.get('/a/c/d')
      nsm.get('/a/c/e')
      nsm.get('/f')
      testIter('/', ['/', '/a', '/a/b', '/a/c', '/a/c/d', '/a/c/e', '/f'])
    })

  })

  describe('resolve', function() {

    var meths = {
      createData: function() {
        return {data1: [1, 2, 3]}
      },
      mergeData: function(merged, data) {
        merged.data1 = merged.data1.concat(data.data1)
      }
    }

    it('should merge subnamespaces', function() {
      var nsm = createNsTree(meths)
      var nsroot = nsm.get('/')
        , nsa = nsm.get('/a')
        , nsab = nsm.get('/a/b')
        , nsac = nsm.get('/a/c')
        , nsacd = nsm.get('/a/c/d')
        , nsace = nsm.get('/a/c/e')
        , nsf = nsm.get('/f')
      nsroot.data.data1 = [666]
      nsab.data.data1 = [4, 5, 6]
      nsac.data.data1 = [7, 8, 9]
      nsacd.data.data1 = [10, 11, 12]
      nsace.data.data1 = [13, 14, 15]
      nsf.data.data1 = [16, 17, 18]

      assert.deepEqual(nsm.get('/a/c/d').resolve(), {data1: [10, 11, 12]})
      assert.deepEqual(nsm.get('/a/b').resolve(), {data1: [4, 5, 6]})
      assert.deepEqual(nsm.get('/a/c').resolve(), {data1: [7, 8, 9, 10, 11, 12, 13, 14, 15]})
      assert.deepEqual(nsm.get('/a').resolve(), {data1: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]})
      assert.deepEqual(nsm.get('/').resolve(), {data1: [666, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]})
    })

  })

})
