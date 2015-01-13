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

  beforeEach(function(done) {
    connections.manager = manager
    manager.start(done) 
  })
  afterEach(function(done) { helpers.afterEach([manager], done) })

  describe('open', function() {

    it('should send a message to all other connections', function(done) {

      // Create dummy connection to listen to the 'open' message
      var dummyConnections = helpers.dummyConnections(2, 3, function(received) {
        var ids = _.pluck(dummyConnections, 'id')
        received.forEach(function(r) { r[2] = ['id'] })
        // Check ids
        ids.forEach(function(id) { assert.ok(_.isString(id) && id.length > 5) })
        // Check for unicity
        assert.equal(_.uniq(ids).length, 3)
        helpers.assertSameElements(received, [
          [0, coreMessages.connectionOpenAddress + '/dummy', ['id']],
          [2, coreMessages.connectionOpenAddress + '/dummy', ['id']],
        ])
        done()
      })

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
        var ids = received.map(function(r) { return r[2][0] })
        received.forEach(function(r) { r[2] = ['id'] })
        // Check ids and unicity
        ids.forEach(function(id) { assert.ok(_.isString(id) && id.length > 5) })
        assert.equal(_.uniq(ids).length, 1)

        helpers.assertSameElements(received, [
          [0, coreMessages.connectionCloseAddress + '/dummy', ['id']],
          [2, coreMessages.connectionCloseAddress + '/dummy', ['id']]
        ])
        done()
      })

      async.series([
        manager.open.bind(manager, dummyConnections[0]),
        manager.open.bind(manager, dummyConnections[2]),
        manager.open.bind(manager, dummyConnections[3]),
      ], function(err, results) {
        if (err) throw err
        manager.subscribe(dummyConnections[0], coreMessages.connectionCloseAddress)
        manager.subscribe(dummyConnections[2], coreMessages.connectionCloseAddress)
        dummyConnections[3].close()
      })
    })

  })

  describe('onSysMessage', function() {

    describe('subscribe', function() {

      it('should subscribe the connection to the given address', function(done) {
        var received = []

        var dummyConnection1 = new helpers.DummyConnection(function(address, args) {
          received.push([1, address, args])
        })
        var dummyConnection2 = new helpers.DummyConnection(function(address, args) {
          received.push([2, address, args])
        })

        async.series([
          manager.open.bind(manager, dummyConnection2),
          manager.open.bind(manager, dummyConnection1)
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
      })

    })

    describe('resend', function() {

      it('should resend the last messages sent at that address', function(done) {
        var received = []

        var dummyConnection = new helpers.DummyConnection(function(address, args) {
          received.push([address, args])
        })

        manager.open(dummyConnection, function(err) {
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
            ['/bli', []],
            ['/neverSeenBefore', []]
          ])
          done()
        })
      })

      it('should send empty list if the address exists but no last message', function(done) {
        var received = []

        var dummyConnection = new helpers.DummyConnection(function(address, args) {
          received.push([address, args])
        })
        manager.open(dummyConnection, function(err) {
          if(err) throw err

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

  })

})
