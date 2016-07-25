"use strict";
var fs = require('fs')
  , assert = require('assert')
  , _ = require('underscore')
  , async = require('async')
  , helpers = require('../../helpers-backend')
  , utils = require('../../../lib/core/utils')

describe('core.utils', () => {

  describe('saveBlob', () => {

    it('should save the blob in the given directory and pick a name automatically', (done) => {
      var buf = new Buffer('blabla')

      async.waterfall([
        (next) => utils.saveBlob('/tmp', buf, next),
        (filePath, next) => fs.readFile(filePath, next)
      ], (err, readBuf) => {
        if (err) throw err
        assert.equal(readBuf.toString(), 'blabla')
        done()
      })

    })

    it('should save the blob with the given extension', (done) => {
      var buf = new Buffer('blabla')

      async.waterfall([
        (next) => utils.saveBlob('/tmp', buf, next, '.wav'),
        (filePath, next) => {
          assert.equal(filePath.slice(-4), '.wav')
          fs.readFile(filePath, next)
        }
      ], (err, readBuf) => {
        if (err) throw err
        assert.equal(readBuf.toString(), 'blabla')
        done()
      })

    })

  })

  describe('NsTree', () => {

    describe('has', () => {

      it('should work correctly', () => {
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

    describe('get', () => {

      it('should create the namespace dynamically', () => {
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

      it('should work also for the root', () => {
        var nsTree = utils.createNsTree()

        assert.ok(!nsTree.has('/'))
        assert.deepEqual(nsTree.get('/'), { address: '/', connections: [], lastMessage: null, children: {} })
        assert.ok(nsTree.has('/'))

        assert.deepEqual(nsTree._root.children, {'': { address: '/', connections: [], lastMessage: null, children: {} }})
      })

      it('shouldn\'t make a difference whether there is trailing slash or not', () => {
        var nsTree = utils.createNsTree()
        assert.equal(nsTree.get('/bla'), nsTree.get('/bla/'))
      })

    })

    describe('toJSON', () => {

      it('should serialize the tree', () => {
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

    describe('fromJSON', () => {

      it('should deserialize the tree', () => {
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

  describe('NsNode', () => {

    describe('forEach', () => {

      it('should iterate over all namespaces no matter depth', () => {
        var nsTree = utils.createNsTree()
          , allData = []
          , iter = (ns) => allData.push(ns.address)

        var testIter = (root, expected) => {
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

})
