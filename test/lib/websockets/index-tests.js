"use strict";
var fs = require('fs')
  , assert = require('assert')
  , async = require('async')
  , websockets = require('../../../lib/websockets')

describe('websockets', () => {

  describe('renderClientBrowser', () => {

    it('should render the client js file to the given folder', (done) => {
      async.series([
        websockets.renderClientBrowser.bind(websockets, '/tmp'),
        fs.unlink.bind(fs, '/tmp/rhizome.js')
      ], done)
    })

    it('should return errors', (done) => {
      websockets.renderClientBrowser('/forbidden', (err) => {
        assert.ok(err)
        assert.equal(err.code, 'EACCES')
        done()
      })
    })

  })

})