var path = require('path')
  , assert = require('assert')
  , spawn = require('child_process').spawn
  , _ = require('underscore')
  , async = require('async')
  , rhizomeBin = require('../../bin/rhizome')
  , helpers = require('../helpers')

var rhizomePath = path.resolve(__dirname, '../../bin/rhizome.js')
  , sampleConfigPath = './bin/config-samples/rhizome-config.js'


describe('bin.rhizome', function() {

  it('should start alright with a valid config', function(done) {
    var rhizome = spawn('node', [rhizomePath, sampleConfigPath])
      , errData = ''
      , outData = ''
      , overTimeout
    rhizome.stdout.on('data', function (data) { outData += data })
    rhizome.stderr.on('data', function (data) { errData += data })
    rhizome.on('close', function (code) {
      clearTimeout(overTimeout)
      assert.equal(errData, '')
      done()
    })
    overTimeout = setTimeout(function() {
      rhizome.kill()
    }, 3000)
  })

  describe('validateConfig', function() {

    it('should accept a valid config', function(done) {
      var config = {
        osc: {
          port: 8002,
          blobsPort: 8004,
        },
        http: {
          port: 8003,
          staticDir: '/tmp'
        },
        websockets: {
          rootUrl: '/',
          usersLimit: 40
        }
      }
      rhizomeBin.validateConfig(config, function(err) {
        if (err) throw err
        done()
      })
    })

    it('should return an error for unvalid configs', function(done) {
      async.series([
        function(next) {
          var config = {
            osc: {},
            http: {},
            websockets: {}
          }
          rhizomeBin.validateConfig(config, function(err) {
            helpers.assertValidationError(err, [ '.osc.port', '.http.staticDir', '.http.port' ])
            next()
          })
        },

        function(next) {
          var config = {
            osc: {port: 'blabla'},
            http: {staticDir: '/IdontExist', port: 8000},
            websockets: {rootUrl: 156}
          }
          rhizomeBin.validateConfig(config, function(err) {
            helpers.assertValidationError(err, [ '.osc.port', '.http.staticDir', '.websockets.rootUrl' ])
            next()
          })
        }
      ], done)

    })

  })

})
