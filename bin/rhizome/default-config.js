_ = require('underscore')

module.exports = function(config) {

  _.extend(config, {

    server: {

      // The host on which rhizome runs
      ip: '127.0.0.1',

      // Directory where blobs received from the web client are saved
      blobsDirName: '/tmp',

      // The port on which the html pages will be served, as well as websocket requests
      webPort: 8000,

      // The port on which the server will receive OSC messages
      oscPort: 9000,

      // The maximum amount of users accepted simultaneously
      usersLimit: 40,

      // The pages that the server should serve. Example :
      // [
      //    { rootUrl: '/bananas', dirName: './bananas_files' },
      //    { rootUrl: '/oranges', dirName: './oranges_files' }
      // ]
      pages: [],

      // The root of the rhizome application on the server
      rootUrl: '/'
    },

    clients: [

      // A list of OSC clients to transmit user messages to. Valid argument for each client is : 
      //    - <ip> : the IP address of the client
      //    - <oscPort> : the port on which the application (Pd, Processing, ...) will receive OSC messages
      //    - <desktopClientPort> : the port on which the desktop client will receive OSC messages

    ]

  })

}
