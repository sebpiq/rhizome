/*
 * Copyright 2014-2015, Sébastien Piquemal <sebpiq@gmail.com>
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
  , expect = require('chai').expect
  , coreMessages = require('../core/messages')
  , coreServer = require('../core/server')
  , coreValidation = require('../core/validation')
  , connections = require('../connections')


var OSCServer = module.exports = function(config) {
  coreServer.Server.call(this, config)
  this._server = null
  this._blobsServer = null
  this._config = config
}

_.extend(OSCServer.prototype, coreValidation.ValidateConfigMixin, coreServer.Server.prototype, {

  start: function(done) {
    var self = this
    this._validateConfig(function(err) {
      if (err) return done(err)

      coreServer.Server.prototype.start.apply(self)

      // This is the OSC server that receives normal messages
      self._server = new moscow.createServer(self._config.port, 'udp')
      self._server.on('message', self._onMessage.bind(self))

      // This is the server on which we receive the blobs sent by the blob client.
      // When an app client wants to send a blob, it sends a message to the server, which then asks the
      // blob client to actually send the blob. That way the user never deals directly with the blob client :
      //    APP                this._server                     BLOB-CLIENT                  this._blobsServer
      //    sendBlobAddress ->
      //                    sendBlobAddress ->
      //                                           /some/address <blob>, <arg1>, <arg2>, ->
      self._blobsServer = new moscow.createServer(self._config.blobsPort, 'tcp')
      self._blobsServer.on('message', function (address, args, rinfo) {
        connections.manager.send(address, args)
      })

      async.waterfall([
        self._server.start.bind(self._server),
        self._blobsServer.start.bind(self._blobsServer),
        connections.manager.listPersisted.bind(connections.manager, OSCConnection.prototype.namespace),

        // Immediately re-open OSC connections that were persisted
        function(ids, next) {
          async.each(ids, function(id, nextId) {
            var parts = id.split(':')
              , connection = new OSCConnection(parts[0], parseInt(parts[1], 10))
            connection.once('open', nextId)
            self.open(connection)
          }, next)
        }
      ], done)
    })
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

  configValidator: new coreValidation.ChaiValidator({
    blobsPort: function(val) {
      expect(val).to.be.a('number')
      expect(val).to.be.within(0, 65535)
    },
    port: function(val) {
      expect(val).to.be.a('number')
      expect(val).to.be.within(0, 65535)
    }
  }),

  configDefaults: {
    blobsPort: 44445
  },

  _onMessage: function (address, args, rinfo) {
    debug('message ' + address)

    // System messages should always have the appPort as first argument.
    if (coreMessages.sysAddressRe.exec(address)) {
      var appPort = args[0]
        , args = args.slice(1)
        , ip = rinfo.address
        , connection = this._findConnection(ip, appPort)

      // Quick port validation
      if (!_.isNumber(appPort) || appPort <= 0 || appPort >= 65536)
        return console.error('Wrong sys message : ' + args + ' / invalid port ' + appPort) 

      // If connection doesn't exist, create it
      if (!connection) {
        connection = new OSCServer.Connection(ip, appPort)
        connection.once('open', connection.onSysMessage.bind(connection, address, args, rinfo))
        this.open(connection)
      } else connection.onSysMessage(address, args, rinfo)

    // If normal message, we traverse the namespaces from / to `address` and send to all sockets
    } else {
      var err = coreMessages.validateAddressForSend(address)
      if (err) debug('invalid address : ' + address + '(' + err + ')')
      else connections.manager.send(address, args)
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
var OSCConnection = function(ip, appPort) {
  coreServer.Connection.apply(this)
  this.ip = ip
  this.appPort = appPort
  this.id = ip + ':' + appPort
  this.appClient = new moscow.createClient(ip, appPort, 'udp')
}
OSCServer.Connection = OSCConnection

_.extend(OSCConnection.prototype, coreServer.Connection.prototype, {
  
  namespace: 'osc',

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
        this.setBlobClient(blobsPort)
        this.appClient.send(coreMessages.configuredAddress, [blobsPort])

        // Saves new blob client config
        connections.manager.connectionUpdate(this, function(err) {
          if (err) self.emit('error', 'error updating connection : ' + err)
        })
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

  setBlobClient: function(blobsPort) {
    this.infos.blobsPort = blobsPort
    this.blobClient = new moscow.createClient(this.ip, blobsPort, 'tcp')
    this.blobClient.on('error', function(err) {
      if (err.code === 'ECONNREFUSED')
        console.error(self.toString() + ' blob client refused connection')
      else console.error(err)
    })
    debug(this.toString() + ' configured blob client to port ' + blobsPort)
  },

  // When deserializing the persisted connection, we need to restore blob client
  deserialize: function(data) {
    coreServer.Connection.prototype.deserialize.apply(this, arguments)
    if (this.infos.blobsPort) this.setBlobClient(this.infos.blobsPort)
  }
})
