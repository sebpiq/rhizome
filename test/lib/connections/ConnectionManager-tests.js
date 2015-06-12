var assert = require('assert')
  , fs = require('fs')
  , _ = require('underscore')
  , async = require('async')
  , rimraf = require('rimraf')
  , ConnectionManager = require('../../../lib/connections/ConnectionManager')
  , persistence = require('../../../lib/connections/persistence')
  , coreUtils = require('../../../lib/core/utils')
  , helpers = require('../../helpers')


describe('ConnectionManager', function() {

  var testDbDir = '/tmp/rhizome-test-db'
  beforeEach(function(done) {
    async.series([
      rimraf.bind(rimraf, testDbDir),
      fs.mkdir.bind(fs, testDbDir)
    ], done)
  })

  describe('start', function() {

    it('should create a NEDBStore automatically if store is a string', function(done) {
      var manager1 = new ConnectionManager({ store: '/tmp' })
        , manager2 = new ConnectionManager({ store: 'IdontExist' })
      async.series([
        manager1.start.bind(manager1),
        function(next) {
          manager2.start(function(err) {
            helpers.assertValidationError(err, ['.store'])
            next()
          })
        }
      ], function(err) {
        if (err) throw err
        assert.ok(manager1._config.store instanceof persistence.NEDBStore)
        done()
      })
    })

    it('should restore saved state', function(done) {
      var managerConfig = { store: testDbDir, storeWriteTime: 1 }
        , manager = new ConnectionManager(managerConfig)
        , restoredManager = new ConnectionManager(managerConfig)

      // Change state of manager
      manager._nsTree.get('/bla/ho').lastMessage = ['hoho', 1, 'huhu']
      manager._nsTree.get('/blu').lastMessage = [122222.901]

      async.series([
        manager.start.bind(manager),
        function(next) { setTimeout(next, 5) }, // wait for manager to save state
        restoredManager.start.bind(restoredManager),
        function(next) {
          helpers.assertSameElements(restoredManager._nsTree.toJSON(), [
            { address: '/', lastMessage: null },
            { address: '/bla', lastMessage: null },
            { address: '/bla/ho', lastMessage: ['hoho', 1, 'huhu'] },
            { address: '/blu', lastMessage: [122222.901] }
          ])
          next()
        },
        manager.stop.bind(manager), // Close those 2, to śtop the interval writing
        restoredManager.stop.bind(restoredManager)
      ], done)
    })

  })

  describe('open', function() {
    var store = new persistence.NEDBStore(testDbDir)
      , connections = new ConnectionManager({ store: store, collectStats: true, storeWriteTime: 1 })
    beforeEach(function(done) { connections.start(done) })
    afterEach(function(done) { connections.stop(done) })    

    it('should open properly and log events if collectStats', function(done) {
      var connection = new helpers.DummyConnection()
      connection.id = '1234'

      connections.open(connection, function(err) {
        if (err) throw err
        assert.deepEqual(connections._openConnections, [connection])

        // As the event is created after the connection has been opened,
        // without acknowledgement, we need to wait before it is inserted
        var events = []
        async.whilst(
          function() { return events.length < 1 },
          function(next) {
            store.eventList(function(err, eList) {
              events = eList
              setTimeout(next.bind(this, err), 20)
            })
          },
          function(err) {
            if (err) throw err
            assert.equal(events.length, 1)
            var event = events[0]
            assert.equal(event.namespace, 'dummy')
            assert.equal(event.id, connection.id)
            assert.equal(event.eventType, 'open')
            assert.ok(_.isNumber(event.timestamp))
            done()
          }
        )

      })
    })

  })

  describe('close', function() {
    var store = new persistence.NEDBStore(testDbDir)
      , connections = new ConnectionManager({ store: store, collectStats: true, storeWriteTime: 1 })
    beforeEach(function(done) { connections.start(done) })
    afterEach(function(done) { connections.stop(done) })    

    it('should close properly and log events if collectStats', function(done) {
      var connection = new helpers.DummyConnection()
      connection.id = '5678'

      async.series([
        connections.open.bind(connections, connection),
        // Wait a bit so 'open' and 'close' events are not simultaneous
        function(next) { setTimeout(next.bind(this, null), 10) },
        connections.close.bind(connections, connection)
      ], function(err) {
        if (err) throw err
        assert.deepEqual(connections._openConnections, [])

        // As the event is created after the connection has been closed,
        // without acknowledgement, we need to wait before it is inserted
        var events = []
        async.whilst(
          function() { return events.length < 2 },
          function(next) {
            store.eventList(function(err, eList) {
              events = eList
              setTimeout(next.bind(this, err), 20)
            })
          },
          function(err) {
            if (err) throw err
            assert.equal(events.length, 2)
            var event = events[1]
            assert.equal(event.namespace, 'dummy')
            assert.equal(event.id, connection.id)
            assert.equal(event.eventType, 'close')
            assert.ok(_.isNumber(event.timestamp))
            done()
          }
        )

      })
    })

  })

  describe('send', function() {

    var connections = new ConnectionManager({store: new persistence.NEDBStore(testDbDir)})
    beforeEach(function(done) { connections.start(done) })
    afterEach(function(done) { connections.stop(done) })

    it('should send messages from subspaces', function(done) {
      var received = []
        , connection = new helpers.DummyConnection(function(address, args) {
          received.push([address, args])
        })
      connection.id = '9abc'

      connections.open(connection, function(err) {
        if(err) throw err
        connections.subscribe(connection, '/a')
        assert.equal(connections.send('/a', [44]), null)
        assert.equal(connections.send('/a/b', [55]), null)
        assert.equal(connections.send('/', [66]), null)
        assert.equal(connections.send('/c', [77]), null)
        assert.equal(connections.send('/a/d', [88]), null)
        assert.equal(connections.send('/a/', [99]), null)

        helpers.assertSameElements(received, [
          ['/a', [44]],
          ['/a/b', [55]],
          ['/a/d', [88]],
          ['/a', [99]]
        ])
        done()
      })

    })

  })

  describe('subscribe', function() {

    var connections = new ConnectionManager({store: new persistence.NEDBStore(testDbDir)})
    beforeEach(function(done) { connections.start(done) })
    afterEach(function(done) { connections.stop(done) })

    it('should return an error message if address in not valid', function(done) {
      var connection = new helpers.DummyConnection()
      connection.id = 'defg'
      connections.open(connection, function(err) {
        if(err) throw err
        assert.ok(_.isString(connections.subscribe(connection, '')))
        assert.ok(_.isString(connections.subscribe(connection, 'bla')))
        assert.ok(_.isString(connections.subscribe(connection, '/sys/bla')))
        done()
      })
    })

  })

  describe('getOpenConnectionsIds', function() {

    var connections = new ConnectionManager({store: new persistence.NEDBStore(testDbDir)})
    beforeEach(function(done) { connections.start(done) })
    afterEach(function(done) { connections.stop(done) })

    it('should return an error message if address in not valid', function(done) {
      var connection = new helpers.DummyConnection()
        , connection2 = new helpers.DummyConnection()
      connection.id = 'defg'
      connection2.id = 'hijk'

      async.series([
        connections.open.bind(connections, connection),
        connections.open.bind(connections, connection2)
      ], function(err) {
        if(err) throw err
        assert.deepEqual(connections.getOpenConnectionsIds('dummy'), ['defg', 'hijk'])
        done()
      })
    })

  })

})
