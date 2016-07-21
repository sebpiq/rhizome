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

var path = require('path')
  , browserify = require('browserify')
  , gulp = require('gulp')
  , source = require('vinyl-source-stream')
  

// Renders the web client to `destinationDir`, as a single JavaScript file called `rhizome.js`.
exports.renderClientBrowser = function(destinationDir, done) {
  browserify({ entries: path.join(__dirname, 'browser-main.js') })
    .ignore('ws')
    .bundle()
    .pipe(source('rhizome.js'))
    //.pipe(uglify())
    // No need to create folder as gulp.dest takes care of it
    .pipe(gulp.dest(destinationDir))
      .on('error', done)
      .on('finish', done)
}

exports.Server = require('./Server')
exports.Client = require('./Client')
