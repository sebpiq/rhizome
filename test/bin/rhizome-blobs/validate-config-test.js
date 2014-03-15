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
        oscPort: 8888
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
        oscPort: 9000
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
        oscPort: 'bloblo'
      }
    }
    validate(config, function(err, finalConfig, validationErrors) {
      if (err) throw err
      assert.deepEqual(Object.keys(validationErrors).sort(), [
        'config.appPort', 'config.blobsPort', 'config.blobsDirName',
        'config.server.ip', 'config.server.oscPort'
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

var defaultConfig = {

  // Port on which the application (Pd, Processing...) receives OSC messages.
  appPort: 9001,

  // Port on which the blob client receives OSC messages.
  blobsPort: 44444,

  // Directory where blobs are stored.
  blobsDirName: '/tmp',

  // Infos about the rhizome server
  server: {
    
    // The host name or IP of the server
    ip: '127.0.0.1',
    
    // The port on which the server is listening for OSC messages
    oscPort: 9000
  }

}

