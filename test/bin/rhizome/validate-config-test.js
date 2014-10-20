var path = require('path')
  , assert = require('assert')
  , _ = require('underscore')
  , async = require('async')
  , validate = require('../../../bin/rhizome/validate-config')
  , helpers = require('../../helpers')

describe('rhizome validate-config', function() {

  it('should accept valid configs', function(done) {
    var config = {
      webPort: 8003,
      oscPort: 8002,
      blobsPort: 8004,
      usersLimit: 40,
      rootUrl: '/',
      pages: [
        {rootUrl: '/page1', dirName: __dirname},
        {rootUrl: '/page2', dirName: '/tmp'}
      ]
    }
    validate(config, function(err, finalConfig, validationErrors) {
      if (err) throw err
      assert.deepEqual(config, finalConfig)
      assert.deepEqual(validationErrors, {})
      done()
    })

  })

  it('should accept valid configs and set defaults', function(done) {
    var config = {
      pages: [
        {rootUrl: '/page1', dirName: path.dirname(__dirname + '/yt')}
      ]
    }
    var expectedConfig = {
      webPort: 8000,
      oscPort: 9000,
      blobsPort: 44445,
      usersLimit: 40,
      rootUrl: '/',
      pages: [
        {rootUrl: '/page1', dirName: __dirname}
      ]
    }
    validate(config, function(err, finalConfig, validationErrors) {
      if (err) throw err
      assert.deepEqual(finalConfig, expectedConfig)
      assert.deepEqual(validationErrors, {})
      done()
    })

  })

  it('should reject invalid values', function(done) {
    async.series([
      function(next) {
        var config = {
          webPort: 'bla',
          oscPort: 'bla',
          usersLimit: null,
          rootUrl: 1234,
          pages: [{rootUrl: 1234, dirName: 1234}]
        }

        validate(config, function(err, finalConfig, validationErrors) {
          assert.deepEqual(config, finalConfig)
          assert.deepEqual(Object.keys(validationErrors).sort(), ([
            'config.webPort', 'config.oscPort', 'config.usersLimit', 'config.rootUrl',
            'config.pages[0].rootUrl', 'config.pages[0].dirName'
          ]).sort())
          next(err)
        })
      },
      function(next) {
        var config = {
          webPort: 1000,
          oscPort: 1000,
          pages: [
            {dirName: 1234},
            {rootUrl: '/page', dirName: '/mostprobablydoesnotexist/'}
          ]
        }

        validate(config, function(err, finalConfig, validationErrors) {
          assert.deepEqual(config, finalConfig)
          assert.deepEqual(Object.keys(validationErrors).sort(), [
            'config.webPort', 'config.oscPort',
            'config.pages[0]',
            'config.pages[1].dirName'
          ].sort())
          next(err)
        })
      }
    ], done)

  })

})
