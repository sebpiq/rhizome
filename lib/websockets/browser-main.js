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

var port
if (window.location.port.length)
  port = parseInt(window.location.port, 10)
else
  port = ({'http:': 80, 'https:': 443})[window.location.protocol]

window.rhizome = new (require('./Client'))({
  port: port,
  hostname: window.location.hostname
})
window.rhizome.utils = {}
window.rhizome.utils.throttle = require('./utils').throttle
