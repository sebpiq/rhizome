module.exports = function(config) {

  config.server.ip = '127.0.0.1'
  config.server.oscPort = 9000

  config.client.blobsDirName = '/tmp'
  config.client.oscPort = 9001
  config.client.blobClientPort = 44444

}
