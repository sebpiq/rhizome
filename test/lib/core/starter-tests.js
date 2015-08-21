var _ = require('underscore')
  , assert = require('assert')
  , async = require('async')
  , expect = require('chai').expect
  , starter = require('../../../lib/core/starter')
  , coreValidation = require('../../../lib/core/validation')
  , errors = require('../../../lib/core/errors')
  , connections = require('../../../lib/connections')
  , helpers = require('../../helpers')


describe('core.starter', function() {
  var toStop = []

  var FakeServer = function(config) { 
    this._config = config
    this.started = false
  }

  _.extend(FakeServer.prototype, coreValidation.ValidateConfigMixin, {

    start: function(done) {
      this.started = true
      done()
    },

    toString: function() {
      return 'FakeServer(' + this._config.a + ')'
    },

    configDefaults: {
      a: 55
    },
    configValidator: new coreValidation.ChaiValidator({
      a: function(val) {
        expect(val).to.be.a('number')
        expect(val).to.be.within(50, 200)
      },
      b: function(val) {
        expect(val).to.be.a('string')
      }
    })

  })

  afterEach(function(done) { helpers.afterEach(toStop, done) })

  it('should start servers and manager', function(done) {
    var manager = new connections.ConnectionManager({ store: '/tmp' })
      , server1 = new FakeServer({ a: 120, b: 'bla' })
      , server2 = new FakeServer({ b: 'uytquytquytq' })
    assert.equal(manager._storeWriteInt, null)

    starter(manager, [ server1, server2 ], function(err) {
      if (err) throw err
      assert.equal(server1.started, true)
      assert.equal(server2.started, true)
      assert.ok(manager._storeWriteInt)
      done()
    })
  })

  it('should return validation errors if there is any', function(done) {
    var manager = new connections.ConnectionManager({ store: 2 })
      , server1 = new FakeServer({ a: 120, b: 7 })
      , server2 = new FakeServer({})
    assert.equal(manager._storeWriteInt, null)

    starter(manager, [ server1, server2 ], function(err) {
      assert.ok(err instanceof errors.ValidationError)
      assert.equal(server1.started, false)
      assert.equal(server2.started, false)
      assert.equal(manager._storeWriteInt, null)
      assert.deepEqual(_.keys(err.fields), [
        'connections.store', 'servers.0.b', 'servers.1.b'])
      done()
    })
  })

})
