var path = require('path')
  , assert = require('assert')
  , _ = require('underscore')
  , async = require('async')
  , validate = require('../../../bin/rhizome-blobs/validate-config')
  , helpers = require('../../helpers')

describe('rhizome-blobs validate-config', function() {

  it('should accept valid configs', function(done) {
    var config = {
      appPort: 20011,
      blobsPort: 33333,
      blobsDirName: '/tmp',
      server: {
        ip: '10.10.10.189',
        blobsPort: 8888
      }
    }
    validate(config, function(err, finalConfig, validationErrors) {
      if (err) throw err
      assert.deepEqual(config, finalConfig)
      assert.deepEqual(validationErrors, {})
      done()
    })

  })

  it('should apply default values', function(done) {
    var config = {
      appPort: 20011,
      blobsDirName: '/tmp'
    }
    var expectedConfig = {
      appPort: 20011,
      blobsDirName: '/tmp',
      blobsPort: 44444,
      server: {
        ip: '127.0.0.1',
        blobsPort: 44445
      }
    }
    validate(config, function(err, finalConfig, validationErrors) {
      if (err) throw err
      assert.deepEqual(expectedConfig, finalConfig)
      assert.deepEqual(validationErrors, {})
      done()
    })

  })

  it('should reject config with invalid values', function(done) {
    var config = {
      appPort: 108,
      blobsPort: 106,
      blobsDirName: '/probablydoesnotexist/veryprobably/',
      server: {
        ip: 'blabla',
        blobsPort: 'bloblo'
      }
    }
    validate(config, function(err, finalConfig, validationErrors) {
      if (err) throw err
      assert.deepEqual(Object.keys(validationErrors).sort(), [
        'config.appPort', 'config.blobsPort', 'config.blobsDirName',
        'config.server.ip', 'config.server.blobsPort'
      ].sort())
      done()
    })
  })

  it('should reject if appPort and blobsPort have same values', function(done) {
    var config = {
      appPort: 3333,
      blobsPort: 3333,
      blobsDirName: '/tmp'
    }
    validate(config, function(err, finalConfig, validationErrors) {
      if (err) throw err
      assert.deepEqual(Object.keys(validationErrors).sort(), [
        'config'
      ].sort())
      done()
    })
  })

})

