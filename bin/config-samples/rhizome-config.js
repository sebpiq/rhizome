module.exports = {

  // [Optional] : Web server. Serves statc web pages.
  http: {

    // [required] : the directory where the html, css, js files are located
    staticDir: '/tmp',

    // [required] : port where the web server will be running. Note that by default
    // websockets will be running on the same port.
    port: 8000

  },

  // [Optional] : OSC server. Listens for OSC connections, and proxies messages to them. 
  osc: {

    // [required] : Port on which the OSC applications will connect
    port: 9000,

    // [default=44445] : Port on which blob client will send the blobs.
    // Note that is relevant only if you use the blob client. 
    blobsPort: 44445

  },

  // [Optional] : Websocket server.
  websockets: {

    // [default='/'] : Root url on which the websocket server will listen
    rootUrl: '/',

    // [required/optional if using http] : Port on which the websocket server will be listening.
    // Note that this is not required if you use the HTTP server, as the websocket server will simply
    // listen on the same port.
    port: 8001,

    // [default=200] : maximum number of sockets that can be connected simultaneously on
    // the web socket server.
    maxSockets: 200
  },

  // [Optional] : Configures the general connections management.
  connections: {

    // [default=null] : whether to persist connection data. This is useful for example
    // if the data associated to each connection is critical.
    // By default, nothing is persisted.
    // If you want it persisted : put the path of a folder where to save the data 
    store: '/tmp',

    // [default=false] : whether to collect usage data.
    collectStats: true

  }
}