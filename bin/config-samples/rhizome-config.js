module.exports = {

  // Web server. Serves statc web pages.
  http: {

    // [required] : the directory where the html, css, js files are located
    staticDir: '/tmp',

    // [required] : port where the web server will be running. Note that by default
    // websockets will be running on the same port.
    port: 8000

  },

  // OSC server. Listens for OSC connections, and proxies messages to them. 
  osc: {

    // [required] : Port on which the OSC applications will connect
    port: 9000,

    // [default=44445] : Port on which blob client will send the blobs.
    // Note that is relevant only if you use the blob client. 
    blobsPort: 44445

  },

  websockets: {

    // [default='/'] : Root url on which the websocket server will listen
    rootUrl: '/',

    // [required/optional if using http] : Port on which the websocket server will be listening.
    // Note that this is not required if you use the HTTP server, as the websocket server will simply
    // listen on the same port.
    port: 8001,

    // [default=1000] : maximum number of users that can be connected simultaneously on
    // the web socket server. Extra users will be queued until space is available.
    usersLimit: 1000
  }
}