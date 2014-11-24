/*
 * Copyright 2014, Sébastien Piquemal <sebpiq@gmail.com>
 *
 * rhizome is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * rhizome is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with rhizome.  If not, see <http://www.gnu.org/licenses/>.
 */

var _ = require('underscore')
  , async = require('async')
  , debug = require('debug')('rhizome.server.osc')
  , moscow = require('moscow')
  , coreMessages = require('../core/messages')
  , coreServer = require('../core/server')
  , connections = require('../connections')


var OSCServer = module.exports = function() {
  coreServer.Server.apply(this)
  this._server = null
  this._blobsServer = null
}

_.extend(OSCServer.prototype, coreServer.Server.prototype, {

  start: function(config, done) {
    coreServer.Server.prototype.start.apply(this)

    // This is the OSC server that receives normal messages
    this._server = new moscow.createServer(config.oscPort, 'udp')
    this._server.on('message', this.onMessage.bind(this))

    // This is the server on which we receive the blobs sent by the blob client.
    // When an app client wants to send a blob, it sends a message to the server, which then asks the
    // blob client to actually send the blob. That way the user never deals directly with the blob client :
    //    APP                this._server                     BLOB-CLIENT                  this._blobsServer
    //    sendBlobAddress ->
    //                    sendBlobAddress ->
    //                                           /some/address <blob>, <arg1>, <arg2>, ->
    this._blobsServer = new moscow.createServer(config.blobsPort, 'tcp')
    this._blobsServer.on('message', function (address, args, rinfo) {
      connections.send(address, args)
    })

    async.series([
      this._server.start.bind(this._server),
      this._blobsServer.start.bind(this._blobsServer)
    ], done)
  },

  stop: function(done) {
    coreServer.Server.prototype.stop.apply(this)
    if (this._server) {
      async.series([
        this._server.stop.bind(this._server),
        this._blobsServer.stop.bind(this._blobsServer)
      ], function(err) {
        this._server = null
        this._blobsServer = null
        done(err)
      })
    } else done()
  },

  onMessage: function (address, args, rinfo) {
    debug('message ' + address)

    // System messages should always have the appPort as first argument.
    if (coreMessages.sysAddressRe.exec(address)) {
      var appPort = args[0]
        , args = args.slice(1)
        , ip = rinfo.address
        , connection = this._findConnection(ip, appPort)

      // If connection doesn't exist, create it
      if (!connection)
        connection = this.open(new OSCConnection({ appPort: appPort, ip: ip }))
      connection.onSysMessage(address, args, rinfo)

    // If normal message, we traverse the namespaces from / to `address` and send to all sockets
    } else {
      var err = coreMessages.validateAddressForSend(address)
      if (err) debug('invalid address : ' + address + '(' + err + ')')
      else connections.send(address, args)
    }
  },

  // Debug function for OSCServer
  debug: debug,

  _findConnection: function(ip, appPort) {
    return _.find(this.connections, function(connection) {
      return connection.ip === ip && connection.appPort === appPort
    })
  }

})


// Class to handle connections from OSC clients. 
var OSCConnection = function(clientConfig) {
  coreServer.Connection.apply(this)
  this.ip = clientConfig.ip
  this.appPort = clientConfig.appPort
  this.appClient = new moscow.createClient(clientConfig.ip, clientConfig.appPort, 'udp')
}

_.extend(OSCConnection.prototype, coreServer.Connection.prototype, {

  send: function(address, args) {
    if (this.blobClient && args.some(function(arg) { return arg instanceof Buffer })) {
      debug(this.toString() + ' sending to blob client ' + address + ' ' + coreMessages.argsToString(args))
      args = [this.appPort].concat(args)
      this.blobClient.send(address, args)
    } else this.appClient.send(address, args)
  },

  onSysMessage: function(address, args) {
    var self = this

    // Change configuration of the client
    if (address === coreMessages.configureAddress) {
      var param = args[0]
      if (param === 'blobClient') {
        var blobsPort = args[1] || 44444
        this.blobClient = new moscow.createClient(this.ip, blobsPort, 'tcp')
        this.blobClient.on('error', function(err) {
          if (err.code === 'ECONNREFUSED')
            console.error(self.toString() + ' blob client refused connection')
          else console.error(err)
        })
        this.appClient.send(coreMessages.configuredAddress, [blobsPort])
      }

    // Receives the request to send a blob, first checks the address,
    // and then asks the blob client to send the requested blob
    } else if (this.blobClient && address === coreMessages.sendBlobAddress) {
      debug(this.toString() + ' asking blob client to send ' + coreMessages.argsToString(args))
      var originalAddress = args[0]
        , err = coreMessages.validateAddressForSend(originalAddress)
      if (err) this.appClient.send(coreMessages.errorAddress, [err])
      else this.blobClient.send(coreMessages.sendBlobAddress, args)

    } else coreServer.Connection.prototype.onSysMessage.apply(this, arguments)
  },

  toString: function() { return 'OSCConnection(' + this.ip  + ', ' + this.appPort + ')' }
})
