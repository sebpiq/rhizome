/*
 * Copyright 2014-2015, Sébastien Piquemal <sebpiq@gmail.com>
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

var _ = require('underscore')
  , chai = require('chai')
  , vpod = require('validation-pod')
  , ValidationError = require('./errors').ValidationError

var ChaiValidator = exports.ChaiValidator = function() { vpod.Validator.apply(this, arguments) }
_.extend(ChaiValidator.prototype, vpod.Validator.prototype, {
  handleError: function(err) { if (err instanceof chai.AssertionError) return err.message }
})

// Mixin for classes that have a config to validate.
// Expects attributes :
//    - `_config` a reference to the config object
//    - `configDefaults` default values for the config
//    - `configValidator` an instance of `ChaiValidator` with tests for each config field
exports.ValidateConfigMixin = {
  validateConfig: function(done) {
    this._config = this._config || {}
    _.defaults(this._config, this.configDefaults)
    this.configValidator.run(this._config, function(err, validationErrors) {
      if (err)
        done(err)
      else if (_.keys(validationErrors).length)
        done(new ValidationError(validationErrors))
      else done()
    })
  }
}
