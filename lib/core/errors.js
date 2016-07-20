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
var _ = require('underscore')

// Error for when the config of an object is not valid
var ValidationError = exports.ValidationError = function ValidationError(fields) {
  this.fields = fields
  this.message = _.map(_.pairs(fields), function(p) {
    return (p[0].length ? p[0] : '/') + ' : ' + p[1]
  }).join('\n')
  this.message = '\n' + this.message
}
ValidationError.prototype = Object.create(Error.prototype)

_.extend(ValidationError.prototype, {
  name: 'ValidationError',

  addPrefix: function(prefix) {
    this.fields = _.chain(this.fields).pair().map(function(p) {
      return [prefix + p[0], p[1]]
    }).object().value()
  }
})