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

var _ = require('underscore')

// Allows us to use the same object for browser and Node.js
var Blob = exports.Blob = typeof window === 'undefined' ? Buffer : window.Blob


// Validates that argument list sent with a message is valid.
// Returns null if `args` is valid, a string indicating the error otherwise.
exports.validateArgs = function(args) {
  if (!_.isArray(args)) return '`args` should be an array'
  var arg, i, length
  for (i = 0, length = args.length; i < length; i++) {
    arg = args[i]
    if (!(_.isString(arg) || _.isNumber(arg) || arg instanceof Blob))
      return 'argument ' + i + ', invalid type'
  }
  return null
}

exports.argsToString = function(args) {
  return '[' + args.map(function(arg) {
    return (arg instanceof Blob) ? 'Blob(' + arg.length + ')' : arg
  }) + ']'
}

// Normalizes an address, removing the trailing slash
var normalizeAddress = exports.normalizeAddress = function(address) {
  if (address === '/') return address
  else if (_.last(address) === '/') return address.slice(0, -1)
  else return address
}

// Validates an address for subscription. Returns `null` if the address is valid, an error message otherwise.
exports.validateAddressForSub = function(address) {
  if (!_.isString(address)) return 'should be a string'
  if (address[0] !== '/') return 'should start with /'
  if (sysAddressRe.exec(address)) return 'system addresses are reserved for the system'
  return null
}

// Validates an address for sending. Returns `null` if the address is valid, an error message otherwise.
exports.validateAddressForSend = function(address) {
  if (address[0] !== '/') return 'should start with /'
  if (broadcastAddressRe.exec(address)) return 'broadcast addresses are reserved for the system'
  return null
}

// Regular expression for system addresses.
var sysAddressRe = exports.sysAddressRe = /^\/sys.*$/
exports.configureAddress = '/sys/config'
exports.configuredAddress = '/sys/configured'
exports.subscribeAddress = '/sys/subscribe'
exports.subscribedAddress = '/sys/subscribed'
exports.sendBlobAddress = '/sys/blob'
exports.errorAddress = '/sys/error'
exports.resendAddress = '/sys/resend'
exports.connectionStatusAddress = '/sys/connection'

// Regular expression for broadcast addresses.
var broadcastAddressRe = exports.broadcastAddressRe = /^\/broadcast.*$/
exports.connectionCloseAddress = '/broadcast/websockets/close'
exports.connectionOpenAddress = '/broadcast/websockets/open'