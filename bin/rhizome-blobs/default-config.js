_ = require('underscore')

module.exports = function(config) {

  _.extend(config, {

    server: {
      
      // The host name or IP of the server
      ip: '127.0.0.1',
      
      // The port on which the server is listening for OSC messages
      oscPort: 9000
    },

    client: {

      // Directory where blobs are stored.
      blobsDirName: '/tmp',

      // Port where the application (Pd, ...) is listening for OSC.
      port: 9001,

      // Port to listen for OSC messages.
      blobClientPort: 44444
    }

  })

}
