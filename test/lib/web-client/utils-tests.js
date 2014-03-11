var assert = require('assert')
  , _ = require('underscore')
  , async = require('async')
  , helpers = require('../../helpers')
  , utils = require('../../../lib/web-client/utils')

describe('web-client.utils', function() {

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