var _ = require('underscore')
  , assert = require('assert')
  , shared = require('../../lib/shared')
  , helpers = require('../helpers')

describe('shared', function() {

  describe('throttle', function() {

    it('should throttle values', function(done) {
      var startTime = +(new Date)
        , sendInterval

      var pushValue = helpers.waitForAnswers(5, function(received) {
        clearInterval(sendInterval)
        var avg = 0
        received.forEach(function(value, i) {
          avg += Math.abs(value - (i * 100))
        })
        avg /= received.length
        assert.ok(avg < 5)
        done()
      })

      var sendValue = shared.throttle(100, pushValue)

      // Should send 0ms after `startTime`, then 10ms, 20ms, ...
      sendValue(+(new Date) - startTime)
      sendInterval = setInterval(function() {
        sendValue(+(new Date) - startTime)
      }, 10)

    })

    it('should stop sending values when not called', function(done) {
      var received = []

      var sendValue = shared.throttle(20, function(value) {
        received.push(value)

        // Only one value should have been sent in total.
        if (received.length === 1) {
          setTimeout(function() {
            assert.equal(received.length, 1)
            done()
          }, 60)
        }

      })

      sendValue(12345)

    })

  })

  describe('validateArgs', function() {

    it('should accept valid args', function() {
      assert.equal(shared.validateArgs([1, 'blabla', new Buffer('hello')]), null)
      assert.equal(shared.validateArgs([]), null)
    })

    it('should reject if invalid args', function() {
      assert.ok(_.isString(shared.validateArgs([1, null])))
      assert.ok(_.isString(shared.validateArgs([[], 'bla'])))
      assert.ok(_.isString(shared.validateArgs([{bla: 111}])))
    })

    it('should reject if args is not an array', function() {
      assert.ok(_.isString(shared.validateArgs({bla: 123})))
      assert.ok(_.isString(shared.validateArgs(null)))
      assert.ok(_.isString(shared.validateArgs()))
    })

  })

  describe('normalizeAddress', function() {

    it('should remove trailing slash', function() {
      assert.equal(shared.normalizeAddress('/'), '/')
      assert.equal(shared.normalizeAddress('/bla'), '/bla')
      assert.equal(shared.normalizeAddress('/bla/blo'), '/bla/blo')
      assert.equal(shared.normalizeAddress('/bla/'), '/bla')
      assert.equal(shared.normalizeAddress('/bla/blo/'), '/bla/blo')
    })

  })

  describe('validateAddressForSub', function() {
    
    it('should accept valid addresses', function() {
      assert.equal(shared.validateAddressForSub('/bla'), null)
      assert.equal(shared.validateAddressForSub('/'), null)
      assert.equal(shared.validateAddressForSub('/bla/blob/tre'), null)
      assert.equal(shared.validateAddressForSub('/blob'), null)
      assert.equal(shared.validateAddressForSub('/1/blob/'), null)
    })

    it('should reject malformed addresses', function() {
      // Should start with /
      assert.ok(_.isString(shared.validateAddressForSub('bla')))
    })

    it('should reject sys addresses', function() {
      assert.ok(_.isString(shared.validateAddressForSub('/sys/bla')))
    })

  })

  describe('validateAddressForSend', function() {
    
    it('should accept valid addresses', function() {
      assert.equal(shared.validateAddressForSend('/bla'), null)
      assert.equal(shared.validateAddressForSend('/'), null)
      assert.equal(shared.validateAddressForSend('/bla/blob/tre'), null)
      assert.equal(shared.validateAddressForSend('/blob'), null)
      assert.equal(shared.validateAddressForSend('/1/blob/'), null)
      assert.equal(shared.validateAddressForSend('/sys/bla'), null)
    })

    it('should reject malformed addresses', function() {
      // Should start with /
      assert.ok(_.isString(shared.validateAddressForSend('bla')))
    })

    it('should reject broadcast addresses', function() {
      assert.ok(_.isString(shared.validateAddressForSend('/broadcast/bla')))
    })

  })

  describe('address regular expressions', function() {

    it('should recognize system address', function() {
      assert.ok(shared.sysAddressRe.exec('/sys/bla/'))
      assert.ok(shared.sysAddressRe.exec('/sys/error'))
      assert.ok(shared.sysAddressRe.exec('/sys'))
      assert.ok(shared.sysAddressRe.exec(shared.subscribeAddress))
      assert.ok(shared.sysAddressRe.exec(shared.subscribedAddress))
      assert.ok(shared.sysAddressRe.exec(shared.sendBlobAddress))
      assert.ok(shared.sysAddressRe.exec(shared.errorAddress))

      assert.equal(shared.sysAddressRe.exec('/bla'), null)
      assert.equal(shared.sysAddressRe.exec('/'), null)
      assert.equal(shared.sysAddressRe.exec('/bla/sys'), null)
      assert.equal(shared.sysAddressRe.exec('sys'), null)
    })

    it('should recognize system address', function() {
      assert.ok(shared.broadcastAddressRe.exec('/broadcast/bla/'))
      assert.ok(shared.broadcastAddressRe.exec('/broadcast/error'))
      assert.ok(shared.broadcastAddressRe.exec('/broadcast'))

      assert.ok(shared.broadcastAddressRe.exec(shared.connectionCloseAddress))
      assert.ok(shared.broadcastAddressRe.exec(shared.connectionOpenAddress))

      assert.equal(shared.broadcastAddressRe.exec('/bla'), null)
      assert.equal(shared.broadcastAddressRe.exec('/'), null)
      assert.equal(shared.broadcastAddressRe.exec('/bla/broadcast'), null)
      assert.equal(shared.broadcastAddressRe.exec('broadcast'), null)
    })

  })

})
