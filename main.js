var path = require('path')
  , debug = require('debug')('mmhl.app')
  , async = require('async')
  , express = require('express')
  , app = express()
  , server = require('http').createServer(app)
  , wsServer = require('./websocket')
  , config = require('../config')
  , frontendPath = path.normalize(path.join(__dirname, '..', 'frontend'))

app.set('port', config.server.port)
app.set('views', path.join(frontendPath, 'templates'))
app.set('view engine', 'hbs')
app.set('view options', {layout: false})
app.use(express.logger('dev'))
app.use(express.bodyParser())
app.use(express.methodOverride())
/*app.use(express.cookieParser())
app.use(express.session({
  store: config.site.sessionStore,
  secret: config.site.cookieSecret
}))
app.use(passport.initialize())
app.use(passport.authenticate('basic', { session: false }))*/
app.use(app.router)
app.use(express.static(path.join(frontendPath, 'assets')))


// add some locals that we can use in the templates
app.locals.static = config.static


// Declare views
app.get('/controllers', function(req, res) {
  res.render('controllers', {
    config: JSON.stringify({})
  })
})

app.get('/diffusion', function(req, res) {
  res.render('diffusion', {
    config: JSON.stringify({})
  })
})

app.get('/trace', function(req, res) {
  res.render('trace', {
    config: JSON.stringify({})
  })
})

if (config.env === 'dev') {
  app.get('/tests', function(req, res) {
    res.render('tests', {
      config: JSON.stringify({})
    })
  })
}


// Start servers
async.parallel([

  function(next) {
    wsServer.startServer({server: server}, function() { next() })
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
