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
  , validate = require('../utils').validate
chai.use(chaiHttp)


var defaultConfig = {

  // The port on which the html pages will be served, as well as websocket requests
  webPort: 8000,

  // The port on which the server will receive OSC messages
  oscPort: 9000,

  // The maximum amount of users accepted simultaneously
  usersLimit: 40,

  // The port on which the server receives blobs
  blobsPort: 44445,

  // The pages that the server should serve. Example :
  // [
  //    { rootUrl: '/bananas', dirName: './bananas_files' },
  //    { rootUrl: '/oranges', dirName: './oranges_files' }
  // ]
  pages: [],

  // The root of the rhizome application on the server
  rootUrl: '/',

  // A list of OSC clients to transmit user messages to. Valid argument for each client is :
  clients: [
    //    - <ip> : the IP address of the client
    //    - <appPort> : the port on which the application (Pd, Processing, ...) will receive OSC messages
    //    - <useBlobClient> : true or false.
    //    - <blobsPort> : the port on which the blob client will receive OSC messages

  ]

}


module.exports = function(config, done) {
  _.defaults(config, defaultConfig)
  var validationErrors = {}

  var validatePage = function(prefix, page, donePage) {

    validate(prefix, page, validationErrors,
      {
        before: function() {
          expect(this).to.have.keys(['rootUrl', 'dirName'])
        },

        done: donePage
      },
      {
        rootUrl: function(val) {
          expect(val).to.be.a('string')
        },

        dirName: function(val, doneDirName) {
          expect(val).to.be.a('string')
          val = this.dirName = path.resolve(this.dirName)
          fs.open(page.dirName, 'r', function(err) {
            if (err && err.code === 'ENOENT')
              err = new chai.AssertionError('path \'' + page.dirName + '\' does not exist')
            doneDirName(err)
          })
        }
      }
    )

  }

  var validateClient = function(prefix, client) {
    validate(prefix, client, validationErrors,
      {
        before: function() {
          expect(this).to.contain.keys(['ip', 'appPort'])
        },

        after: function() {
          if (this.useBlobClient && (this.blobsPort === this.appPort))
            new chai.AssertionError('appPort and blobsPort should be different')
        }
      },
      {
        appPort: function(val) {
          expect(val).to.be.a('number')
          expect(val).to.be.within(1025, 49150)
        },

        ip: function(val) {
          expect(val).to.be.an.ip
        },

        useBlobClient: function(val) {
          expect(val).to.be.a('Boolean')
        },

        blobsPort: function(val) {
          expect(val).to.be.a('number')
          expect(val).to.be.within(1025, 49150)
        }
      }
    )
  }

  validate('config', config, validationErrors,
    {
      after: function() {
        if (_.uniq([this.oscPort, this.webPort, this.blobsPort]))
          new chai.AssertionError('oscPort, webPort and blobsPort must be all different')
      },
      done: done
    }, 
    {
      webPort: function(val) {
        expect(val).to.be.a('number')
        expect(val).to.be.within(1025, 49150)
      },

      oscPort: function(val) {
        expect(val).to.be.a('number')
        expect(val).to.be.within(1025, 49150)
      },

      blobsPort: function(val) {
        expect(val).to.be.a('number')
        expect(val).to.be.within(1025, 49150)
      },

      usersLimit: function(val) {
        expect(val).to.be.a('number')
      },

      rootUrl: function(val) {
        expect(val).to.be.a('string')
      },
      
      pages: function(val, donePages) {
        expect(val).to.be.an('array')
        async.parallel(val.map(function(page, i) {
          return function(next) {
            validatePage('config.pages['+i+']', page, next)
          }
        }), donePages)
      },

      clients: function(val) {
        expect(val).to.be.an('array')
        config.clients.forEach(function(client, i) {
          _.defaults(client, {useBlobClient: false, blobsPort: 44444})
          validateClient('config.clients['+i+']', client)
        })
      }
    }
  )

}
