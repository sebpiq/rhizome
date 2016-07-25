"use strict";
var _ = require('underscore')
  , assert = require('assert')
  , coreMessages = require('../../../lib/core/messages')
  , helpers = require('../../helpers-backend')

describe('core.messages', () => {

  describe('validateArgs', () => {

    it('should accept valid args', () => {
      assert.equal(coreMessages.validateArgs([1, 'blabla', new Buffer('hello')]), null)
      assert.equal(coreMessages.validateArgs([]), null)
    })

    it('should reject if invalid args', () => {
      assert.ok(_.isString(coreMessages.validateArgs([1, null])))
      assert.ok(_.isString(coreMessages.validateArgs([[], 'bla'])))
      assert.ok(_.isString(coreMessages.validateArgs([{bla: 111}])))
    })

    it('should reject if args is not an array', () => {
      assert.ok(_.isString(coreMessages.validateArgs({bla: 123})))
      assert.ok(_.isString(coreMessages.validateArgs(null)))
      assert.ok(_.isString(coreMessages.validateArgs()))
    })

  })

  describe('normalizeAddress', () => {

    it('should remove trailing slash', () => {
      assert.equal(coreMessages.normalizeAddress('/'), '/')
      assert.equal(coreMessages.normalizeAddress('/bla'), '/bla')
      assert.equal(coreMessages.normalizeAddress('/bla/blo'), '/bla/blo')
      assert.equal(coreMessages.normalizeAddress('/bla/'), '/bla')
      assert.equal(coreMessages.normalizeAddress('/bla/blo/'), '/bla/blo')
    })

  })

  describe('validateAddressForSub', () => {
    
    it('should accept valid addresses', () => {
      assert.equal(coreMessages.validateAddressForSub('/bla'), null)
      assert.equal(coreMessages.validateAddressForSub('/'), null)
      assert.equal(coreMessages.validateAddressForSub('/bla/blob/tre'), null)
      assert.equal(coreMessages.validateAddressForSub('/blob'), null)
      assert.equal(coreMessages.validateAddressForSub('/1/blob/'), null)
    })

    it('should reject malformed addresses', () => {
      // Should start with /
      assert.ok(_.isString(coreMessages.validateAddressForSub('bla')))
      assert.ok(_.isString(coreMessages.validateAddressForSub('')))
    })

    it('should reject if not a string', () => {
      assert.ok(_.isString(coreMessages.validateAddressForSub()))
      assert.ok(_.isString(coreMessages.validateAddressForSub(236)))
    })

    it('should reject sys addresses', () => {
      assert.ok(_.isString(coreMessages.validateAddressForSub('/sys/bla')))
    })

  })

  describe('validateAddressForSend', () => {
    
    it('should accept valid addresses', () => {
      assert.equal(coreMessages.validateAddressForSend('/bla'), null)
      assert.equal(coreMessages.validateAddressForSend('/'), null)
      assert.equal(coreMessages.validateAddressForSend('/bla/blob/tre'), null)
      assert.equal(coreMessages.validateAddressForSend('/blob'), null)
      assert.equal(coreMessages.validateAddressForSend('/1/blob/'), null)
      assert.equal(coreMessages.validateAddressForSend('/sys/bla'), null)
    })

    it('should reject malformed addresses', () => {
      // Should start with /
      assert.ok(_.isString(coreMessages.validateAddressForSend('bla')))
    })

    it('should reject broadcast addresses', () => {
      assert.ok(_.isString(coreMessages.validateAddressForSend('/broadcast/bla')))
    })

  })

  describe('address regular expressions', () => {

    it('should recognize system address', () => {
      assert.ok(coreMessages.sysAddressRe.exec('/sys/bla/'))
      assert.ok(coreMessages.sysAddressRe.exec('/sys/error'))
      assert.ok(coreMessages.sysAddressRe.exec('/sys'))
      assert.ok(coreMessages.sysAddressRe.exec(coreMessages.subscribeAddress))
      assert.ok(coreMessages.sysAddressRe.exec(coreMessages.subscribedAddress))
      assert.ok(coreMessages.sysAddressRe.exec(coreMessages.sendBlobAddress))
      assert.ok(coreMessages.sysAddressRe.exec(coreMessages.errorAddress))

      assert.equal(coreMessages.sysAddressRe.exec('/bla'), null)
      assert.equal(coreMessages.sysAddressRe.exec('/'), null)
      assert.equal(coreMessages.sysAddressRe.exec('/bla/sys'), null)
      assert.equal(coreMessages.sysAddressRe.exec('sys'), null)
    })

    it('should recognize system address', () => {
      assert.ok(coreMessages.broadcastAddressRe.exec('/broadcast/bla/'))
      assert.ok(coreMessages.broadcastAddressRe.exec('/broadcast/error'))
      assert.ok(coreMessages.broadcastAddressRe.exec('/broadcast'))

      assert.ok(coreMessages.broadcastAddressRe.exec(coreMessages.connectionCloseAddress))
      assert.ok(coreMessages.broadcastAddressRe.exec(coreMessages.connectionOpenAddress))

      assert.equal(coreMessages.broadcastAddressRe.exec('/bla'), null)
      assert.equal(coreMessages.broadcastAddressRe.exec('/'), null)
      assert.equal(coreMessages.broadcastAddressRe.exec('/bla/broadcast'), null)
      assert.equal(coreMessages.broadcastAddressRe.exec('broadcast'), null)
    })

  })

})
