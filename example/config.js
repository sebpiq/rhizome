module.exports = function(config) {

  config.server.port = 8001
  config.server.pages = [
    { rootUrl: '/example', dirName: './simple' }
  ]

  config.osc.port = 9000
  config.osc.clients = [
    { ip: 'localhost', port: 9001 }
  ]
}
