_ = require('underscore')

module.exports = function(config) {

  _.extend(config, {

    // Port on which the application (Pd, Processing...) receives OSC messages.
    appPort: 9001,

    // Port on which the blob client receives OSC messages.
    blobClientPort: 44444,

    // Directory where blobs are stored.
    blobsDirName: '/tmp',

    // Infos about the rhizome server
    server: {
      
      // The host name or IP of the server
      ip: '127.0.0.1',
      
      // The port on which the server is listening for OSC messages
      oscPort: 9000
    }

  })

}
