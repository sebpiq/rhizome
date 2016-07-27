"use strict";
var _ = require('underscore')
  , assert = require('assert')
  , utils = require('../../../lib/websockets/utils')
  , helpers = require('../../helpers-backend')

describe('websockets.utils', () => {

  describe('throttle', () => {

    it('should send last received value after delay', (done) => {
      var startTime = +(new Date)
        , time = 200

      // We should receive 2 messages : the one sent at first, starting the throttle phase 
      // and the last one sent during throttle phase. 
      var pushValue = helpers.waitForAnswers(2, (received) => {
        assert.deepEqual(received, [[1], [2]])
        assert.ok((+(new Date) - startTime) - time < 10)
        done()
      })

      var sendValue = utils.throttle(pushValue, time)

      // Should send 0ms after `startTime`, then 10ms, 20ms, ...
      sendValue(1)
      setTimeout(() => sendValue(2), 100)
      setTimeout(() => sendValue(999), 50) // Should be overwritten
      setTimeout(() => sendValue(888), 20) // Should be overwritten
    })

    it('should stop sending values when not called', (done) => {
      var received = []

      var sendValue = utils.throttle((value) => {
        received.push(value)

        // Only one value should have been sent in total.
        if (received.length === 1) {
          setTimeout(() => {
            assert.equal(received.length, 1)
            done()
          }, 60)
        }

      }, 20)

      sendValue(12345)

    })

  })

})