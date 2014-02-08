module.exports = function(grunt) {

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),

    uglify: {
      options: {
        banner: '/*! <%= pkg.name %> | <%= grunt.template.today("yyyy-mm-dd") %> | <%= pkg.author %> */\n'
      },
      build: {
        src: 'build/rhizome.js',
        dest: 'build/rhizome.js'
      }
    },

    browserify: {
      dist: {
        files: {
          'build/rhizome.js': ['lib/client/index.js'],
        }
      }
    }
  })

  grunt.loadNpmTasks('grunt-contrib-uglify')
  grunt.loadNpmTasks('grunt-browserify')

  grunt.registerTask('default', ['browserify', 'uglify'])

}
