"use strict";
var fs = require('fs')
  , assert = require('assert')
  , async = require('async')
  , websockets = require('../../../lib/websockets')

describe('websockets', function() {

  describe('renderClientBrowser', function() {

    it('should render the client js file to the given folder', function(done) {
      async.series([
        websockets.renderClientBrowser.bind(websockets, '/tmp'),
        fs.unlink.bind(fs, '/tmp/rhizome.js')
      ], done)
    })

    it('should return errors', function(done) {
      websockets.renderClientBrowser('/forbidden', function(err) {
        assert.ok(err)
        assert.equal(err.code, 'EACCES')
        done()
      })
    })

  })

})