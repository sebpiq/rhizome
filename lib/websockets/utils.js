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
"use strict";

var _ = require('underscore')

// Allows us to use the same object for browser and Node.js
var Blob = exports.Blob = typeof window === 'undefined' ? Buffer : window.Blob


// Helper to limit the number of messages sent to the server. throttle(func, time)
// `time` is the minimum interval in milliseconds at which `func` will be called.
// Returns a throttled version of `func`.
exports.throttle = _.throttle