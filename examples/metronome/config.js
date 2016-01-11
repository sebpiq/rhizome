var fs = require('fs');
var path = require('path');
var storeDir= path.join(__dirname, 'tmp');
if (!fs.existsSync(storeDir)) fs.mkdirSync(storeDir);

module.exports= {
    servers: [
        {
            type: 'http',
            config: {
                port: 8000,
                staticDir: path.join(__dirname, 'app')
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
