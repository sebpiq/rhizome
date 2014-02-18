var _ = require('underscore')
  , assert = require('assert')
  , shared = require('../lib/shared')

describe('normalizeAddress', function() {

  it('should remove trailing slash', function() {
    assert.equal(shared.normalizeAddress('/'), '/')
    assert.equal(shared.normalizeAddress('/bla'), '/bla')
    assert.equal(shared.normalizeAddress('/bla/blo'), '/bla/blo')
    assert.equal(shared.normalizeAddress('/bla/'), '/bla')
    assert.equal(shared.normalizeAddress('/bla/blo/'), '/bla/blo')
  })

})

describe('validateAddress', function() {
  
  it('should accept only well formed addresses', function() {
    assert.equal(shared.validateAddress('/bla'), null)
    assert.equal(shared.validateAddress('/'), null)
    assert.equal(shared.validateAddress('/bla/blob/tre'), null)
    assert.equal(shared.validateAddress('/blob'), null)
    assert.equal(shared.validateAddress('/1/blob/'), null)

    // Should start with /
    assert.ok(_.isString(shared.validateAddress('bla')))
  })

})

describe('address regular expressions', function() {

  it('should recognize blob addresses', function() {
    assert.ok(shared.blobAddressRe.exec('/bla/blob/'))
    assert.ok(shared.blobAddressRe.exec('/blob'))

    assert.equal(shared.blobAddressRe.exec('/bla'), null)
    assert.equal(shared.blobAddressRe.exec('/'), null)
    assert.equal(shared.blobAddressRe.exec('/blob/bla'), null)
    assert.equal(shared.blobAddressRe.exec('blob'), null)
  })

  it('should recognize system address', function() {
    assert.ok(shared.sysAddressRe.exec('/sys/bla/'))
    assert.ok(shared.sysAddressRe.exec('/sys/error'))
    assert.ok(shared.sysAddressRe.exec('/sys'))

    assert.equal(shared.sysAddressRe.exec('/bla'), null)
    assert.equal(shared.sysAddressRe.exec('/'), null)
    assert.equal(shared.sysAddressRe.exec('/bla/sys'), null)
    assert.equal(shared.sysAddressRe.exec('sys'), null)
  })

})

describe('NsTree', function() {

  var meths = {
    createData: function() {
      return {data1: [1, 2, 3]}
    }
  }

  describe('has', function() {

    it('should work correctly', function() {
      var nsTree = shared.createNsTree(meths)
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
      var nsTree = shared.createNsTree(meths)

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
      var nsTree = shared.createNsTree(meths)

      assert.ok(!nsTree.has('/'))
      assert.deepEqual(nsTree.get('/'), { address: '/', data: {'data1': [1, 2, 3]}, children: {} })
      assert.ok(nsTree.has('/'))

      assert.deepEqual(nsTree._root.children, {'': { address: '/', data: {data1: [1, 2, 3]}, children: {} }})
    })

  })

})

describe('NsNode', function() {

  describe('forEach', function() {

    it('should iterate over all namespaces no matter depth', function() {
      var nsTree = shared.createNsTree({createData: function() { return this.address }})
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

})
