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
      ],
      clients: [
        {ip: '120.120.0.5', appPort: 9002, useBlobClient: true, blobsPort: 9003},
        {ip: '203.1.76.84', appPort: 9004}
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
      ],
      clients: [
        {ip: '120.120.0.5', appPort: 9002}
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
      ],
      clients: [
        {ip: '120.120.0.5', appPort: 9002, useBlobClient: false}
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
          pages: [{rootUrl: 1234, dirName: 1234}],
          clients: [{ip: '120', appPort: 'hello', useBlobClient: 678, blobsPort: 'bla'}]
        }

        validate(config, function(err, finalConfig, validationErrors) {
          assert.deepEqual(config, finalConfig)
          assert.deepEqual(Object.keys(validationErrors).sort(), ([
            'config.webPort', 'config.oscPort', 'config.usersLimit', 'config.rootUrl',
            'config.pages[0].rootUrl', 'config.pages[0].dirName',
            'config.clients[0].ip', 'config.clients[0].appPort', 'config.clients[0].useBlobClient', 'config.clients[0].blobsPort'
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
          ],
          clients: [
            {appPort: 8000, useBlobClient: true, blobsPort: 8000}
          ]
        }

        validate(config, function(err, finalConfig, validationErrors) {
          assert.deepEqual(config, finalConfig)
          assert.deepEqual(Object.keys(validationErrors).sort(), [
            'config.webPort', 'config.oscPort',
            'config.pages[0]',
            'config.pages[1].dirName',
            'config.clients[0]'
          ].sort())
          next(err)
        })
      }
    ], done)

  })

})
