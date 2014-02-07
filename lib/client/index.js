require('debug').enable('websocket,soundfile')

window.mmhl = {}
window.mmhl.client = require('./client')
window.mmhl.config = require('../config')

// Debugging
mmhl.DEBUG = false
mmhl.debugLog = function(msg) {
  if (mmhl.DEBUG) $('<div>').html(msg).appendTo('#console')
}

$(function() {
  if (mmhl.DEBUG) $('<div>', {'id': 'console'}).html('NONE').appendTo('body')
})
