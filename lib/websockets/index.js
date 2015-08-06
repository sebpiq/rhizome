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

var path = require('path')
  , concat = require('gulp-concat')
  , browserify = require('browserify')
  , modernizr = require('modernizr')
  , through = require('through2')
  , gulp = require('gulp')
  , gutil = require('gulp-util')
  , source = require('vinyl-source-stream')
  , buffer = require('vinyl-buffer')
  , eventStream = require('event-stream')

exports.Server = require('./Server')
exports.Client = require('./Client')

var modernizrStream = function() {
  var stream = through.obj(function(file, enc, cb) {
    modernizr.build({'feature-detects': ['websockets/binary']}, function(result) {
      var filePath = path.resolve(process.cwd(), 'modernizr.js')
      file = new gutil.File({ path: filePath, contents: new Buffer(result) })
      stream.push(file)
      cb()
    })
  })

  // Write something to trigger the transform function once
  stream.write('')
  stream.end()
  return stream
}

var browserifyStream = function() {
  return browserify({ entries: path.join(__dirname, 'browser-main.js') })
    .bundle()
    .pipe(source('browserified.js'))
    .pipe(buffer())
}

// Renders the web client to `destinationDir`, as a single JavaScript file called `rhizome.js`.
exports.renderClientBrowser = function(destinationDir, done) {
  renderClientBrowserGulp(destinationDir)
    .on('error', done)
    .on('finish', done)
}

// Renders the web client to `destinationDir`, as a single JavaScript file called `rhizome.js`.
var renderClientBrowserGulp = exports.renderClientBrowserGulp = function(destinationDir) {
  return eventStream.merge(modernizrStream(), browserifyStream())
    .pipe(concat('rhizome.js'))
    //.pipe(uglify())
    // No need to create folder as gulp.dest takes care of it
    .pipe(gulp.dest(destinationDir))
}