"use strict";
var path = require('path')
  , assert = require('assert')
  , spawn = require('child_process').spawn
  , _ = require('underscore')
  , async = require('async')
  , helpers = require('../helpers-backend')

var rhizomeBlobsPath = path.resolve(__dirname, '../../bin/rhizome-blobs.js')
  , sampleConfigPath = './bin/config-samples/rhizome-blobs-config.js'

describe('bin.rhizome-blobs', function() {

  it('should start alright with a valid config', function(done) {
    var rhizomeBlobs = spawn('node', [rhizomeBlobsPath, sampleConfigPath])
      , errData = ''
      , outData = ''
      , overTimeout
    rhizomeBlobs.stdout.on('data', function (data) { outData += data })
    rhizomeBlobs.stderr.on('data', function (data) { errData += data })
    rhizomeBlobs.on('close', function (code) {
      clearTimeout(overTimeout)
      assert.equal(errData, '')
      assert.ok(outData.length > 100)
      done()
    })
    overTimeout = setTimeout(function() {
      rhizomeBlobs.kill()
    }, 1500)
  })

})