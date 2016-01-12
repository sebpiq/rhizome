var fs = require('fs')
  , path = require('path')
  , storeDir= path.join(__dirname, 'tmp')
if (!fs.existsSync(storeDir)) fs.mkdirSync(storeDir)

module.exports = {
  servers: [
    {
      type: 'http',
      config: {
        port: 8000,
        staticDir: path.join(__dirname, 'pages')
      }
    },
    {
      type: 'osc',
      config: {
        port: 9000
      }
    },
    {
      type: 'websockets',
      config: {
        port: 8000,
        maxSockets: 5
      }
    }
  ],
  connections: {
    store: storeDir
  }
}
