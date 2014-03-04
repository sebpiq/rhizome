var assert = require('assert')
  , _ = require('underscore')
  , connections = require('../../../lib/server/connections')

describe('connections', function() {

  describe('send', function() {

    it.skip('should throw an error if args are invalid', function() {
      assert.throws(function() { connections.send('/bla/bli', {}) })
      assert.throws(function() { connections.send('/bla/bli', [1, null]) })
    })

  })

})
