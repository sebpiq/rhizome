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

exports.sendJSON = function(socket, msg) {
  socket.send(JSON.stringify(msg))
}

exports.normalizeAddress = function(address) {
  if (address === '/') return address
  else if (_.last(address) === '/') return address.slice(0, -1)
  else return address
}

// Validates that an address entered by a user is valid.
// Returns `null` if the address is valid, an error message otherwise.
exports.validateAddress = function(address) {
  if (address[0] !== '/') return 'should start with /'
  if (sysAddressRe.exec(address)) return 'system addresses are reserved for the system'
  return null
}

// Regular expression for `blob` address.
exports.blobAddressRe = /^.*\/blob\/?$/

// Regular expression for system addresses.
var sysAddressRe = exports.sysAddressRe = /^\/sys.*$/

exports.gimmeBlobAddress = '/sys/blob/gimme'
exports.fromDesktopBlobAddress = '/sys/blob/fromDesktop'
exports.fromWebBlobAddress = '/sys/blob/fromWeb'
exports.errorAddress = '/sys/error'

exports.createNsTree = function(meths) {
  var nsClass = function() { NsNode.apply(this, arguments) }
  _.extend(nsClass.prototype, NsNode.prototype, _.pick(meths, 'createData', 'mergeData'))
  return new NsTree(nsClass)
}

var NsNode = function(address) {
  this.address = address
  this.children = {}
  this.data = this.createData()
}

_.extend(NsNode.prototype, {

  forEach: function(iter) {
    var self = this
      , children = _.values(this.children)
    iter(this)
    if (children.length) _.forEach(children, function(ns) { ns.forEach(iter) })
  },

  // TODO : useless?
  resolve: function() {
    var self = this
      , children = _.values(this.children)
    if (children.length) {
      var merged = _.clone(this.data)
      _.forEach(children, function(ns) {
        self.mergeData(merged, ns.resolve())
      })
      return merged
    } else return _.clone(this.data)
  },

  mergeData: function(merged, data) {},

  createData: function() { return null }

})

var NsTree = function(nsClass) {
  this._root = { children: {}, address: '' }
  this.nsClass = nsClass
}

_.extend(NsTree.prototype, {

  has: function(address) {
    var parts = this._getParts(address)
      , ns = this._root
    while(parts.length) {
      ns = ns.children[parts.shift()]
      if (!ns) return false
      else if (ns.address === address) return true
    }
    return false
  },

  get: function(address, iter) {
    var parts = this._getParts(address)
      , ns = this._root
      , part, currentAddr
    while (parts.length) {
      part = parts.shift()
      if (!ns.children[part]) {
        currentAddr = ns.address === '/' ? ('/' + part) : (ns.address + '/' + part)
        ns.children[part] = new this.nsClass(currentAddr)
      }
      ns = ns.children[part]
      if (iter) iter(ns)
    }
    return ns
  },

  // Split address into normalized parts.
  //     /a/b/c -> ['', 'a', 'b']
  //     / -> ['']
  _getParts: function(address) {
    if (address === '/') return ['']
    else return address.split('/')
  }

})
