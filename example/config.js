module.exports = function(config) {

  /*
  // Configurations for the http and websocket servers
  server: {

    // The port on which the html pages will be served, as well as websocket requests
    port: 8008,

    // The root of the rhizome application on the server
    rootUrl: '/',

    // The maximum amount of users accepted simultaneously
    usersLimit: 40,
  },

  // Configuration for OSC server and clients 
  osc: {

    // The port on which rhizome will receive OSC messages
    port: 9000,

    // The host on which rhizome runs
    hostname: 'localhost',

    // A list of OSC clients to transmit user messages to.
    // example :
    // [ {ip: '192.168.0.200', port: 57120}, {ip: '192.168.0.205', port: 9001} ]
    clients: [] 
  }
  */

  config.server.port = 8001
  config.server.pages = [
    { rootUrl: '/clicks', dirName: './get_clicks_page' }
  ]

  config.osc.port = 9000
  config.osc.clients = [
    { ip: 'localhost', port: 9001 }
  ]
}
