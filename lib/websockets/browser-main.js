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

var port, protocol = ({'http:': 'ws', 'https:': 'wss'})[window.location.protocol]
if (window.location.port.length)
  port = parseInt(window.location.port, 10)
else
  port = ({'http:': 80, 'https:': 443})[window.location.protocol]

window.rhizome = new (require('./Client'))({
  protocol: protocol,
  port: port,
  hostname: window.location.hostname
})
window.rhizome.utils = {}
window.rhizome.utils.throttle = require('./utils').throttle

// We save our own Modernizr version, and restore the one that was defined before
// if there was one. See also 'index.js'
window.rhizome.Modernizr = window.Modernizr
if (window._Modernizr) {
  window.Modernizr = window._Modernizr
  delete window._Modernizr
} else delete window.Modernizr
