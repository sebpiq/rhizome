var path = require('path')
  , browserify = require('browserify')
  , gulp = require('gulp')
  , uglify = require('gulp-uglify')
  , gutil = require('gulp-util')
  , source = require('vinyl-source-stream')
  , buffer = require('vinyl-buffer')

exports.WebSocketServer = require('./WebSocketServer')

// Renders the web client to `destinationDir`, as a single JavaScript file called `rhizome.js`.
exports.renderClient = function(destinationDir, done) {
  browserify({ entries: path.resolve(__dirname, '../../web-client/index.js') })
    .bundle()
    .pipe(source('rhizome.js'))
    .pipe(buffer())
    .pipe(uglify())
    .on('error', done)
    // No need to create folder as gulp.dest takes care of it
    .pipe(gulp.dest(destinationDir))
    .on('error', done)
    .on('finish', done)
}