var _ = require('underscore')
  , assert = require('assert')
  , utils = require('../../../lib/websockets/utils')
  , helpers = require('../../helpers-backend')

describe('websockets.utils', function() {

  describe('throttle', function() {

    it('should throttle values', function(done) {
      var startTime = +(new Date)
        , sendInterval

      var pushValue = helpers.waitForAnswers(5, function(received) {
        clearInterval(sendInterval)
        var diffs = []
          , avgDiffs
          , i
        for (i = 1; i < received.length; i++)
          diffs.push(received[i] - received[i-1])
        avgDiffs = diffs.reduce(function(a, b) { return a + b }, 0) / diffs.length
        assert.ok(avgDiffs < 110)
        assert.ok(avgDiffs > 90)
        done()
      })

      var sendValue = utils.throttle(100, pushValue)

      // Should send 0ms after `startTime`, then 10ms, 20ms, ...
      sendValue(+(new Date) - startTime)
      sendInterval = setInterval(function() {
        sendValue(+(new Date) - startTime)
      }, 10)

    })

    it('should stop sending values when not called', function(done) {
      var received = []

      var sendValue = utils.throttle(20, function(value) {
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

})