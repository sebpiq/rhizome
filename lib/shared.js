var _ = require('underscore')

exports.sendJSON = function(socket, msg) {
  socket.send(JSON.stringify(msg))
}

exports.createNsTree = function(meths) {
  var nsClass = function() { Node.apply(this, arguments) }
  _.extend(nsClass.prototype, Node.prototype, _.pick(meths, 'createData', 'mergeData'))
  return new Tree(nsClass)
}

var Node = function(address) {
  this.address = address
  this.children = {}
  this.data = this.createData()
}

_.extend(Node.prototype, {

  forEach: function(iter) {
    var self = this
      , children = _.values(this.children)
    iter(this)
    if (children.length) _.forEach(children, function(ns) { ns.forEach(iter) })
  },

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

var Tree = function(nsClass) {
  this._root = { children: {}, address: '' }
  this.nsClass = nsClass
}

_.extend(Tree.prototype, {

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

  normalize: function(address) {
    if (address === '/') return address
    else if (_.last(address) === '/') return address.slice(0, -1)
    else return address
  },

  // Split address into normalized parts.
  //     /a/b/c -> ['', 'a', 'b']
  //     / -> ['']
  _getParts: function(address) {
    if (address === '/') return ['']
    else return address.split('/')
  }

})
