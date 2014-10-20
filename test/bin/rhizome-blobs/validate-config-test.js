var path = require('path')
  , assert = require('assert')
  , _ = require('underscore')
  , async = require('async')
  , validate = require('../../../bin/rhizome-blobs/validate-config')
  , helpers = require('../../helpers')

describe('rhizome-blobs validate-config', function() {

  it('should accept valid configs', function(done) {
    var config = {
      appPorts: [20011, 20012],
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
      appPorts: [20011, 20012],
      blobsDirName: '/tmp'
    }
    var expectedConfig = {
      appPorts: [20011, 20012],
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
      appPorts: [108, 20011, 'bla'],
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
        'config.appPorts[0]', 'config.appPorts[2]', 'config.blobsPort',
        'config.blobsDirName', 'config.server.ip', 'config.server.blobsPort'
      ].sort())
      done()
    })
  })

  it('should reject if appPorts and blobsPort have same values', function(done) {
    var config = {
      appPorts: [3333, 4444],
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

