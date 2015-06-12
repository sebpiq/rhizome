var _ = require('underscore')
  , assert = require('assert')
  , async = require('async')
  , Connection = require('../../../lib/core/server').Connection
  , connections = require('../../../lib/connections') 
  , coreMessages = require('../../../lib/core/messages')
  , helpers = require('../../helpers')


describe('core.server.Connection', function() {
  var manager = new connections.ConnectionManager({
    store: connections.NoStore()
  })

  beforeEach(function(done) { helpers.beforeEach(manager, done) })
  afterEach(function(done) { helpers.afterEach([manager], done) })

  describe('open', function() {

    it('should send a message to all other connections', function(done) {

      // Create dummy connection to listen to the 'open' message
      var dummyConnections = helpers.dummyConnections(2, 3, function(received) {
        helpers.assertSameElements(received, [
          [0, coreMessages.connectionOpenAddress + '/dummy', ['1']],
          [2, coreMessages.connectionOpenAddress + '/dummy', ['1']],
        ])
        done()
      })

      // Assign ids
      dummyConnections.forEach(function(c, i) { c.id = i.toString() })

      async.series([
        manager.open.bind(manager, dummyConnections[0]),
        manager.open.bind(manager, dummyConnections[2]),
      ], function(err) {
        if (err) throw err

        manager.subscribe(dummyConnections[0], coreMessages.connectionOpenAddress)
        manager.subscribe(dummyConnections[2], coreMessages.connectionOpenAddress)

        dummyConnections[1].open()
      })
    })

  })

  describe('close', function() {

    it('should send a message to all other connections', function(done) {
      // Create dummy connections to listen to the 'close' message
      var dummyConnections = helpers.dummyConnections(2, 4, function(received) {
        helpers.assertSameElements(received, [
          [0, coreMessages.connectionCloseAddress + '/dummy', ['3']],
          [2, coreMessages.connectionCloseAddress + '/dummy', ['3']]
        ])
        done()
      })

      // Assign ids
      dummyConnections.forEach(function(c, i) { c.id = i.toString() })

      async.series([
        manager.open.bind(manager, dummyConnections[0]),
        manager.open.bind(manager, dummyConnections[2]),
        manager.open.bind(manager, dummyConnections[3])
      ], function(err, results) {
        if (err) throw err
        manager.subscribe(dummyConnections[0], coreMessages.connectionCloseAddress)
        manager.subscribe(dummyConnections[2], coreMessages.connectionCloseAddress)
        dummyConnections[3].close()
      })
    })

  })

  describe('onSysMessage', function() {

    it('should queue the messages if the connection is not opened yet', function(done) {
      var received = []
      var dummyConnection = new helpers.DummyConnection(function(address, args) {
        received.push([1, address, args])
      })
      dummyConnection.id = '1'

      // Send onSysMessages
      dummyConnection.onSysMessage(coreMessages.subscribeAddress, ['/bla'])
      dummyConnection.onSysMessage(coreMessages.subscribeAddress, ['/blo'])
      assert.deepEqual(received, [])

      // The actual subscription happens only after connection has been opened
      dummyConnection.once('open', function() {
        helpers.assertSameElements(received, [
          [1, coreMessages.subscribedAddress, ['/bla']],
          [1, coreMessages.subscribedAddress, ['/blo']]
        ])
        done()
      })
      dummyConnection.open()
    })

    describe('subscribe', function() {

      it('should subscribe the connection to the given address', function(done) {
        var received = []

        var dummyConnection1 = new helpers.DummyConnection(function(address, args) {
          received.push([1, address, args])
        })
        var dummyConnection2 = new helpers.DummyConnection(function(address, args) {
          received.push([2, address, args])
        })
        dummyConnection1.id = '1'
        dummyConnection2.id = '2'

        async.parallel([
          dummyConnection1.once.bind(dummyConnection1, 'open'),
          dummyConnection2.once.bind(dummyConnection2, 'open')
        ], function(err) {
          if (err) throw err
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
        dummyConnection1.open()
        dummyConnection2.open()
      })

    })

    describe('resend', function() {

      it('should resend the last messages sent at that address', function(done) {
        var received = []

        var dummyConnection = new helpers.DummyConnection(function(address, args) {
          received.push([address, args])
        })
        dummyConnection.id = '1'

        dummyConnection.once('open', function(err) {
          if(err) throw err

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
        dummyConnection.open()
      })

      it('should send empty list if the address exists but no last message', function(done) {
        var received = []

        var dummyConnection = new helpers.DummyConnection(function(address, args) {
          received.push([address, args])
        })
        dummyConnection.id = 'bla'
        
        dummyConnection.once('open', function(err) {
          if(err) throw err

          dummyConnection.onSysMessage(coreMessages.subscribeAddress, ['/bla'])
          dummyConnection.onSysMessage(coreMessages.resendAddress, ['/bla'])

          helpers.assertSameElements(received, [
            ['/sys/subscribed', ['/bla']],
            ['/bla', []]
          ])
          done()
        })
        dummyConnection.open()

      })

    })

    describe('connectionsSendList', function() {

      it('should send the id list of opened connections', function(done) {
        var received = []

        var dummyConnection1 = new helpers.DummyConnection(function(address, args) {
          received.push([1, address, args])
        })
        var dummyConnection2 = new helpers.DummyConnection(function(address, args) {
          received.push([2, address, args])
        })
        dummyConnection1.id = '1'
        dummyConnection2.id = '2'

        async.parallel([
          dummyConnection1.once.bind(dummyConnection1, 'open'),
          dummyConnection2.once.bind(dummyConnection2, 'open')
        ], function(err) {
          if (err) throw err
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
        dummyConnection1.open()
        dummyConnection2.open()

      })

    })

  })

})
