var _ = require('underscore')
  , fs = require('fs')
  , path = require('path')

var IdManager = exports.IdManager = function(idCount) {
  this.ids = []
  this.idCount = idCount
}

_.extend(IdManager.prototype, {

  get: function() {
    this.ids.sort()
    // Find the first free id
    var id = _.find(this.ids, function(id, k) {
      if (id !== k) return true
    })

    // if there isn't, try to assign an id in the end of the array
    if (!_.isNumber(id)) {
      if (this.ids.length < this.idCount) id = this.ids.length
      else return null
    } else id = id - 1

    this.ids.push(id)
    return id
  },

  free: function(id) {
    this.ids = _.reject(this.ids, function(other) { return other === id })
    this.ids.sort()
  }

})
