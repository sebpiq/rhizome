var _ = require('underscore')
  , assert = require('assert')
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
  
})
