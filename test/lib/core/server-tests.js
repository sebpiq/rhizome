"use strict";
var _ = require('underscore')
  , assert = require('assert')
  , async = require('async')
  , coreServer = require('../../../lib/core/server')
  , connections = require('../../../lib/connections') 
  , coreMessages = require('../../../lib/core/messages')
  , helpers = require('../../helpers-backend')


describe('core.server', () => {
  var manager

  beforeEach((done) => { 
    manager = new connections.ConnectionManager({ store: connections.NoStore() })
    helpers.beforeEach([ manager ], done) 
  })
  afterEach((done) => { helpers.afterEach([ manager ], done) })

  describe('Connection', () => {

    describe('open', () => {

      it('should send an "open" message to all other connections', (done) => {
        var dummyServer = new helpers.DummyServer()
        // We wait for our dummy connections to receive 2 messages, and exit the test
          , messageHandler = helpers.waitForAnswers(2, (received) => {
            helpers.assertSameElements(received, [
              [0, coreMessages.connectionOpenAddress + '/dummy', ['1']],
              [2, coreMessages.connectionOpenAddress + '/dummy', ['1']],
            ])
            done()
          })

        // Create 2 dummy connections
        async.series([
          dummyServer.openConnection.bind(dummyServer, [ (address, args) => messageHandler(0, address, args), '0' ]),
          dummyServer.openConnection.bind(dummyServer, [ (address, args) => messageHandler(2, address, args), '2' ]),

        ], (err, dummyConnections) => {
          if (err) return done(err)

          // Subscribing our dummy connections to the broadcast message "open"
          manager.subscribe(dummyConnections[0], coreMessages.connectionOpenAddress)
          manager.subscribe(dummyConnections[1], coreMessages.connectionOpenAddress)

          // Opening a 3rd connection
          dummyServer.openConnection([() => {}, '1'], (err) => err && done(err))
        })
      })

      it('should restore subscriptions', (done) => {
        var dummyServer = new helpers.DummyServer()

        // Dummy connection class that will restore subscriptions
        var DummyConnection = function(args) {
          var subscriptions = args.pop()
          helpers.DummyConnection.call(this, args)
          this.deserialize({ subscriptions: subscriptions })
        }
        _.extend(DummyConnection.prototype, helpers.DummyConnection.prototype)
        dummyServer.ConnectionClass = DummyConnection

        // Open a few connections, with their restore subscriptions
        async.series([
          dummyServer.openConnection.bind(dummyServer, [ () => {}, '0', ['/bla/poet', '/blo'] ]),
          dummyServer.openConnection.bind(dummyServer, [ () => {}, '1', [] ]),
          dummyServer.openConnection.bind(dummyServer, [ () => {}, '2', ['/u'] ])

        // Check that subscriptions have actually been restored in manager
        ], (err, dummyConnections) => { 
          if (err) return done(err)
          assert.ok(manager.isSubscribed(dummyConnections[0], '/bla/poet'))
          assert.ok(manager.isSubscribed(dummyConnections[0], '/blo'))
          assert.ok(!manager.isSubscribed(dummyConnections[1], '/blo'))
          assert.ok(manager.isSubscribed(dummyConnections[2], '/u'))
          done()
        })

      })

    })

    describe('close', () => {

      it('should send a "close" message to all other connections', (done) => {
        var dummyServer = new helpers.DummyServer()
        // We wait for our dummy connections to receive 2 messages, and exit the test
          , messageHandler = helpers.waitForAnswers(2, (received) => {
            helpers.assertSameElements(received, [
              [0, coreMessages.connectionCloseAddress + '/dummy', ['3']],
              [2, coreMessages.connectionCloseAddress + '/dummy', ['3']]
            ])
            done()
          })

        // Create 4 dummy connections
        async.series([
          dummyServer.openConnection.bind(dummyServer, [(address, args) => messageHandler(0, address, args), '0']),
          dummyServer.openConnection.bind(dummyServer, [(address, args) => messageHandler(1, address, args), '1']),
          dummyServer.openConnection.bind(dummyServer, [(address, args) => messageHandler(2, address, args), '2']),
          dummyServer.openConnection.bind(dummyServer, [(address, args) => messageHandler(3, address, args), '3'])
        
        ], (err, dummyConnections) => {
          if (err) return done(err)

          // Subscribing our dummy connections to the broadcast message "close"
          manager.subscribe(dummyConnections[0], coreMessages.connectionCloseAddress)
          manager.subscribe(dummyConnections[2], coreMessages.connectionCloseAddress)
          manager.subscribe(dummyConnections[3], coreMessages.connectionCloseAddress)

          // Closing one of the connections
          dummyConnections[3].close()
        })
      })

    })

    describe('onSysMessage', () => {

      it('should queue the messages if the connection is not opened yet', (done) => {
        var received = []
          , dummyServer = new helpers.DummyServer()
          , managerOpen

        // Override `manager.open` method to simulate the connection receiving sys message
        // right before it is opened.
        managerOpen = connections.manager.open
        connections.manager.open = function(connection) {
          connection.onSysMessage(coreMessages.subscribeAddress, ['/bla'])
          connection.onSysMessage(coreMessages.subscribeAddress, ['/blo'])
          managerOpen.apply(this, arguments)
        }

        // The actual sys messages are executed only after connection has been opened
        dummyServer.openConnection([ (address, args) => received.push([1, address, args]), '1' ], () => {
          helpers.assertSameElements(received, [
            [1, coreMessages.subscribedAddress, ['/bla']],
            [1, coreMessages.subscribedAddress, ['/blo']]
          ])
          done()
        })
      })

      describe('subscribe', () => {

        it('should subscribe the connection to the given address', (done) => {
          var received = []
            , dummyServer = new helpers.DummyServer()

          async.series([
            dummyServer.openConnection.bind(dummyServer, [ (address, args) => received.push([1, address, args]), '1']),
            dummyServer.openConnection.bind(dummyServer, [ (address, args) => received.push([2, address, args]), '2'])

          ], (err, results) => {
            if (err) return done(err)
            var dummyConnection1 = results[0]
              , dummyConnection2 = results[1]
            dummyConnection1.onSysMessage(coreMessages.subscribeAddress, ['/bla'])
            dummyConnection2.onSysMessage(coreMessages.subscribeAddress, ['/bla/'])
            dummyConnection1.onSysMessage(coreMessages.subscribeAddress, ['/'])

            helpers.assertSameElements(received, [
              [1, coreMessages.subscribedAddress, ['/bla']],
              [2, coreMessages.subscribedAddress, ['/bla/']],
              [1, coreMessages.subscribedAddress, ['/']]
            ])
            assert.equal(manager._nsTree.get('/bla').connections.length, 2)
            assert.equal(manager._nsTree.get('/').connections.length, 1)
            done()
          })

        })

      })

      describe('resend', () => {

        it('should resend the last messages sent at that address', (done) => {
          var received = []
            , dummyServer = new helpers.DummyServer
          
          dummyServer.openConnection([ (address, args) => received.push([address, args]), '1' ], (err, dummyConnection) => {
            if (err) return done(err)
            manager.send('/bla', [1, 'toitoi', new Buffer('hello')])
            manager.send('/bla/blo', [111])
            manager.send('/blu', ['feeling'])
            manager.send('/bla/blo', [222])
            manager.send('/bli', [])
            manager.send('/bly', [new Buffer('tyutyu')])
            manager.send('/bla', [2, 'tutu', new Buffer('hello')])
            manager.send('/bla/blo', [333])

            dummyConnection.onSysMessage(coreMessages.resendAddress, ['/bla']) // Blobs
            dummyConnection.onSysMessage(coreMessages.resendAddress, ['/bla/blo'])
            dummyConnection.onSysMessage(coreMessages.resendAddress, ['/bli']) // Empty messages
            dummyConnection.onSysMessage(coreMessages.resendAddress, ['/neverSeenBefore']) // Address that never received a message

            helpers.assertSameElements(received, [
              ['/bla', [2, 'tutu', new Buffer('hello')]],
              ['/bla/blo', [333]],
              ['/bli', []]
              // neverSeenBefore shouldnt be resent
            ])
            done()
          })
        })

        it('should send empty list if the address exists but no last message', (done) => {
          var received = []
            , dummyServer = new helpers.DummyServer()

          dummyServer.openConnection([ (address, args) => received.push([address, args]), 'bla' ], (err, dummyConnection) => {
            if (err) return done(err)
            dummyConnection.onSysMessage(coreMessages.subscribeAddress, ['/bla'])
            dummyConnection.onSysMessage(coreMessages.resendAddress, ['/bla'])

            helpers.assertSameElements(received, [
              ['/sys/subscribed', ['/bla']],
              ['/bla', []]
            ])
            done()
          })

        })

      })

      describe('connectionsSendList', () => {

        it('should send the id list of opened connections', (done) => {
          var received = []
            , dummyServer = new helpers.DummyServer()

          async.series([
            dummyServer.openConnection.bind(dummyServer, [ (address, args) => received.push([1, address, args]), '1' ]),
            dummyServer.openConnection.bind(dummyServer, [ (address, args) => received.push([2, address, args]), '2' ])

          ], (err, results) => {
            if (err) return done(err)
            var dummyConnection1 = results[0]
              , dummyConnection2 = results[1]
            dummyConnection1.onSysMessage(coreMessages.connectionsSendListAddress, ['dummy'])
            dummyConnection2.onSysMessage(coreMessages.connectionsSendListAddress, ['dummy'])
            dummyConnection1.onSysMessage(coreMessages.connectionsSendListAddress, [])

            helpers.assertSameElements(received, [
              [1, coreMessages.connectionsTakeListAddress + '/dummy', ['1', '2']],
              [2, coreMessages.connectionsTakeListAddress + '/dummy', ['1', '2']],
              [1, coreMessages.connectionsTakeListAddress + '/undefined', []]
            ])
            done()
          })

        })

      })

    })

  })

  describe('Server', () => {

    describe('stop', () => {

      it('should close properly all connections', (done) => {
        var dummyServer = new helpers.DummyServer()
          , connectionIdCounter = 0
          , connectionClosedCount = 0

        var _newConnection = (next) => {
          dummyServer.openConnection([() => {}, '' + connectionIdCounter++], (err, connection) => {
            if (err) return next(err)
            connection.on('close', () => connectionClosedCount++)
            next()
          })
        }

        // Add 3 dummy connections to the server
        assert.equal(connections.manager._openConnections.length, 0)
        async.series([
          _newConnection,
          _newConnection,
          _newConnection,
          (next) => {
            assert.equal(connections.manager._openConnections.length, 3)
            assert.equal(dummyServer.connections.length, 3)
            next()
          },
          dummyServer.stop.bind(dummyServer)

        ], (err) => {
          if (err) return done(err)
          assert.equal(dummyServer.connections.length, 0)
          assert.equal(connections.manager._openConnections.length, 0)
          assert.equal(connectionClosedCount, 3)
          done()
        })

      })

    })

  })

})
