var path = require('path')
  , assert = require('assert')
  , _ = require('underscore')
  , async = require('async')
  , validate = require('../../../bin/rhizome-blobs/validate-config')
  , helpers = require('../../helpers')

describe('rhizome-blobs validate-config', function() {

  it('should accept valid configs', function(done) {
    var config = {
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
      blobsDirName: '/tmp'
    }
    var expectedConfig = {
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
        'config.blobsPort', 'config.blobsDirName', 'config.server.ip', 'config.server.blobsPort'
      ].sort())
      done()
    })
  })

})

