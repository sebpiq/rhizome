_ = require('underscore')

module.exports = function(config) {

  _.extend(config, {
    // Configurations for the http and websocket servers
    server: {

      // The port on which the html pages will be served, as well as websocket requests
      port: 8000,

      // The root of the rhizome application on the server
      rootUrl: '/',

      // The maximum amount of users accepted simultaneously
      usersLimit: 40,

      // The pages that the server should serve. Example :
      // [
      //    { rootUrl: '/bananas', dirName: './bananas_files' },
      //    { rootUrl: '/oranges', dirName: './oranges_files' }
      // ]
      pages: [],

      // Directory where blobs received from the web client are saved
      blobsDirName: '/tmp'
    },

    // Configuration for OSC server and clients 
    osc: {

      // The port on which the server will receive OSC messages
      port: 9000,

      // The host on which rhizome runs
      hostname: 'localhost',

      // A list of OSC clients to transmit user messages to. Example :
      // [ {ip: '192.168.0.200', port: 57120}, {ip: '192.168.0.205', port: 9001} ]
      clients: []
    },

    desktopClient: {
      port: 44444,

      // Directory where blobs received from the server are saved
      blobsDirName: '/tmp'
    }

  })

}
