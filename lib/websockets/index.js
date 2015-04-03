var path = require('path')
  , browserify = require('browserify')
  , gulp = require('gulp')
  , uglify = require('gulp-uglify')
  , gutil = require('gulp-util')
  , source = require('vinyl-source-stream')
  , buffer = require('vinyl-buffer')

exports.Server = require('./Server')
exports.Client = require('./Client')

// Renders the web client to `destinationDir`, as a single JavaScript file called `rhizome.js`.
exports.renderClientBrowser = function(destinationDir, done) {
  renderClientBrowserGulp(destinationDir)
    .on('error', done)
    .on('finish', done)
}

// Renders the web client to `destinationDir`, as a single JavaScript file called `rhizome.js`.
var renderClientBrowserGulp = exports.renderClientBrowserGulp = function(destinationDir) {
  return browserify({ entries: path.join(__dirname, 'browser-main.js') })
    .bundle()
    .pipe(source('rhizome.js'))
    .pipe(buffer())
    //.pipe(uglify())
    // No need to create folder as gulp.dest takes care of it
    .pipe(gulp.dest(destinationDir))
}