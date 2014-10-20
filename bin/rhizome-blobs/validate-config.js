/*
 * Copyright 2014, Sébastien Piquemal <sebpiq@gmail.com>
 *
 * rhizome is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * rhizome is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with rhizome.  If not, see <http://www.gnu.org/licenses/>.
 */
var fs = require('fs')
  , path = require('path')
  , _ = require('underscore')
  , async = require('async')
  , chai = require('chai')
  , expect = chai.expect
  , chaiHttp = require('chai-http')
  , validateObject = require('../utils').validateObject
  , validate = require('../utils').validate
chai.use(chaiHttp)


var defaultConfig = {

  // <appPorts> List of ports on which the application (Pd, Processing...) receives OSC messages.
  // <blobsDirName> Directory where blobs are stored.
  // <fileExtension> Blobs will be saved with the given file extension
  
  // Port on which the blob client receives OSC messages.
  blobsPort: 44444,

  // Infos about the rhizome server
  server: {
    
    // The host name or IP of the server
    ip: '127.0.0.1',
    
    // The port on which the server is listening for blobs
    blobsPort: 44445
  }

}


module.exports = function(config, done) {
  _.defaults(config, defaultConfig)
  var validationErrors = {}

  validateObject('config', config, validationErrors, {
    after: function() {
      var blobsPort = this.blobsPort
      if (_.some(this.appPorts, function(appPort) { return appPort === blobsPort }))
        throw new chai.AssertionError('appPorts and blobsPort should be different')
    },
    done: done
  }, {

    fileExtension: function() {

    },

    appPorts: function(val) {
      expect(val).to.be.an('array')
      val.forEach(function(appPort, i) {
        validate('config.appPorts[' + i + ']', validationErrors, appPort, function() {
          expect(appPort).to.be.a('number')
          expect(appPort).to.be.within(1025, 49150)
        })
      })
    },

    blobsPort: function(val) {
      expect(val).to.be.a('number')
      expect(val).to.be.within(1025, 49150)
    },

    blobsDirName: function(val, doneDirName) {
      expect(val).to.be.a('string')
      val = this.blobsDirName = path.resolve(this.blobsDirName)
      fs.open(val, 'r', function(err) {
        if (err && err.code === 'ENOENT')
          err = new chai.AssertionError('path \'' + val + '\' does not exist')
        doneDirName(err)
      })
    },

    server: function(val) {
      expect(val).to.contain.keys(['ip'])
      _.defaults(val, {blobsPort: 44445})

      validateObject('config.server', val, validationErrors, {}, {
        blobsPort: function(val) {
          expect(val).to.be.a('number')
          expect(val).to.be.within(1025, 49150)
        },

        ip: function(val) {
          expect(val).to.be.an.ip
        }
      })
    }
  })

}
