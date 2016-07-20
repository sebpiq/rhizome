/*
 * Copyright 2014-2016, Sébastien Piquemal <sebpiq@gmail.com>
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

var path = require('path')
  , _ = require('underscore')
  , async = require('async')
  , errors = require('./errors')
  , connections = require('../connections')

module.exports = function(manager, servers, done) {
  var validOps = []
    , startOps = []

  // Create list of operations to execute asynchronously.
  ;[manager].concat(servers).forEach(function(server) {
    validOps.push(function(next) {
      server.validateConfig(function(err) {
        if (err) {
          if (err instanceof errors.ValidationError) next(null, err)
          else next(err)
        } else next()
      })
    })
  })
  servers.forEach(function(server) {
    startOps.push(server.start.bind(server))
  })

  async.series([
    
    // 1) handles validation of all configs
    function(validationDone) {
      async.series(validOps, function(err, validationErrors) {
        if (err) return validationDone(err)
        else if (_.filter(validationErrors).length === 0) return validationDone()

        // Prefix validation errors and merge them.
        var merged = {}
        validationErrors.forEach(function(errors, i) {
          if (!errors) return
          var prefix = i === 0 ? 'connections': 'servers.' + (i - 1)
          _.pairs(errors.fields).forEach(function(p) {
            merged[prefix + p[0]] = p[1]
          })
        })
        validationDone(new errors.ValidationError(merged))
      })
    },

    // 2) starts the manager
    manager.start.bind(manager),

    // 3) handles starting all servers
    function(startDone) { 
      connections.manager = manager
      async.parallel(startOps, startDone) 
    }

  ], done)
}