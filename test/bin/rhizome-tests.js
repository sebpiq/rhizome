var path = require('path')
  , assert = require('assert')
  , spawn = require('child_process').spawn
  , _ = require('underscore')
  , async = require('async')
  , rhizomeBin = require('../../bin/rhizome')
  , helpers = require('../helpers-backend')

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

})
