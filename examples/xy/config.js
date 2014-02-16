module.exports = function(config) {

  config.server.webPort = 8001
  config.server.oscPort = 9000
  config.server.pages = [
    { rootUrl: '/example', dirName: './pages' }
  ]
  config.clients = [
    { ip: '127.0.0.1', oscPort: 9001 }
  ]
}
