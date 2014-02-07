var path = require('path')
  , fs = require('fs')
  , spawn = require('child_process').spawn
  , debug = require('debug')('mmhl.app')
  , async = require('async')
  , express = require('express')
  , app = express()
  , server = require('http').createServer(app)
  , wsServer = require('./lib/server/websockets')
  , oscServer = require('./lib/server/osc')
  , config = require('./config')
  , buildDir = path.join(__dirname, 'build')

config.server.instance = server

app.set('port', config.server.port)
app.use(express.logger('dev'))
app.use(express.bodyParser())
app.use(express.methodOverride())
app.use(app.router)
app.use('/rhizome', express.static(buildDir))


// add some locals that we can use in the templates
app.locals.static = config.static


// Declare views
app.get('/trace', function(req, res) {
  res.render('trace', {
    config: JSON.stringify({})
  })
})


// Start servers
async.parallel([

  function(next) {
    async.waterfall([
      function(next) { fs.exists(buildDir, function(exists) { next(null, exists) }) },
      function(exists, next) {
        if (!exists) fs.mkdir(buildDir, next)
        else next()
      },
      function(next) {
        var grunt  = spawn('grunt')
        grunt.on('close', function (code, signal) {
          if (code === 0) next()
          else next(new Error('grunt terminated with error'))
        })
      }
    ])
  },

  function(next) {
    wsServer.start(config, next)
  },

  function(next) {
    oscServer.start(config, next)
  },

  function(next) {
    server.listen(app.get('port'), function() {
      debug('Express server listening on port ' + app.get('port'))
      next()
    })
  }

], function(err) {
  if (err) throw err
  debug('ready to roll')
})
