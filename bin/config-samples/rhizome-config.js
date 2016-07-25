module.exports = {

  // List of all the servers you want to start. 
  // Three types of servers are available at the moment : OSC, HTTP and websockets.
  servers: [


    // Web server. Serves statc web pages.
    {
      type: 'http',
      config: {

        // [required] : the directory where the html, css, js files are located
        staticDir: '/tmp',

        // [required] : port where the web server will be running. Note that by default
        // websockets will be running on the same port.
        port: 8000
      },
    },


    // OSC server. Listens for OSC connections, and proxies messages to them.
    {
      type: 'osc',
      config: {

        // [required] : Port on which the OSC applications will connect
        port: 9000,

        // [default=44445] : Port on which blob client will send the blobs.
        // Note that is relevant only if you use the blob client. 
        blobsPort: 44445
      }
    },


    // Websocket server.
    {
      type: 'websockets',
      config: {

        // [default='/'] : Root url on which the websocket server will listen
        rootUrl: '/',

        // [required] : Port on which the websocket server will be listening.
        // Note that you can use the same port as an HTTP server.
        port: 8001,

        // [default=200] : maximum number of sockets that can be connected simultaneously on
        // the web socket server.
        maxSockets: 200
      }
    }

  ],

  // [Optional] : Configures the general connections management.
  connections: {

    // [default=null] : whether to persist connection data. This is useful for example
    // if the data associated to each connection is critical.
    // By default, nothing is persisted.
    // If you want it persisted : put the path of a folder where to save the data 
    store: '/tmp'

  }
}