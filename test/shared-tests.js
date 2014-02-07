var _ = require('underscore')
  , assert = require('assert')
  , createNsTree = require('../lib/shared').createNsTree
  , normalizeAddress = require('../lib/shared').normalizeAddress

describe('Tree', function() {

  var meths = {
    createData: function() {
      return {data1: [1, 2, 3]}
    }
  }

  describe('has', function() {

    it('should work correctly', function() {
      var nsTree = createNsTree(meths)
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
      var nsTree = createNsTree(meths)

      assert.ok(!nsTree.has('/'))
      assert.ok(!nsTree.has('/bla'))
      assert.deepEqual(nsTree.get('/bla'), { address: '/bla', data: {'data1': [1, 2, 3]}, children: {} })
      assert.ok(nsTree.has('/'))
      assert.ok(nsTree.has('/bla'))

      assert.ok(!nsTree.has('/bla/blo/bli'))
      assert.ok(!nsTree.has('/bla/blo'))
      assert.deepEqual(nsTree.get('/bla/blo/bli'), { address: '/bla/blo/bli', data: {'data1': [1, 2, 3]}, children: {} })
      assert.ok(nsTree.has('/bla/blo/bli'))
      assert.ok(nsTree.has('/bla/blo'))
    })

    it('should work also for the root', function() {
      var nsTree = createNsTree(meths)

      assert.ok(!nsTree.has('/'))
      assert.deepEqual(nsTree.get('/'), { address: '/', data: {'data1': [1, 2, 3]}, children: {} })
      assert.ok(nsTree.has('/'))

      assert.deepEqual(nsTree._root.children, {'': { address: '/', data: {data1: [1, 2, 3]}, children: {} }})
    })

  })

})

describe('Node', function() {

  describe('forEach', function() {

    it('should iterate over all namespaces no matter depth', function() {
      var nsTree = createNsTree({createData: function() { return this.address }})
        , allData = []
        , iter = function(ns) { allData.push(ns.data) }

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
      var nsTree = createNsTree(meths)
      var nsroot = nsTree.get('/')
        , nsa = nsTree.get('/a')
        , nsab = nsTree.get('/a/b')
        , nsac = nsTree.get('/a/c')
        , nsacd = nsTree.get('/a/c/d')
        , nsace = nsTree.get('/a/c/e')
        , nsf = nsTree.get('/f')
      nsroot.data.data1 = [666]
      nsab.data.data1 = [4, 5, 6]
      nsac.data.data1 = [7, 8, 9]
      nsacd.data.data1 = [10, 11, 12]
      nsace.data.data1 = [13, 14, 15]
      nsf.data.data1 = [16, 17, 18]

      assert.deepEqual(nsTree.get('/a/c/d').resolve(), {data1: [10, 11, 12]})
      assert.deepEqual(nsTree.get('/a/b').resolve(), {data1: [4, 5, 6]})
      assert.deepEqual(nsTree.get('/a/c').resolve(), {data1: [7, 8, 9, 10, 11, 12, 13, 14, 15]})
      assert.deepEqual(nsTree.get('/a').resolve(), {data1: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]})
      assert.deepEqual(nsTree.get('/').resolve(), {data1: [666, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]})
    })

  })

})

describe('normalizeAddress', function() {

  it('should remove trailing slash', function() {
    assert.equal(normalizeAddress('/'), '/')
    assert.equal(normalizeAddress('/bla'), '/bla')
    assert.equal(normalizeAddress('/bla/blo'), '/bla/blo')
    assert.equal(normalizeAddress('/bla/'), '/bla')
    assert.equal(normalizeAddress('/bla/blo/'), '/bla/blo')
  })

})
