"use strict";
var assert = require('assert')
  , fs = require('fs')
  , _ = require('underscore')
  , async = require('async')
  , rimraf = require('rimraf')
  , ConnectionManager = require('../../../lib/connections/ConnectionManager')
  , persistence = require('../../../lib/connections/persistence')
  , coreUtils = require('../../../lib/core/utils')
  , helpers = require('../../helpers-backend')


describe('ConnectionManager', () => {

  var testDbDir = '/tmp/rhizome-test-db'
  beforeEach((done) => {
    async.series([
      rimraf.bind(rimraf, testDbDir),
      fs.mkdir.bind(fs, testDbDir)
    ], done)
  })

  describe('start', () => {

    it('should create a NEDBStore automatically if store is a string', (done) => {
      var manager1 = new ConnectionManager({ store: '/tmp' })
        , manager2 = new ConnectionManager({ store: 'IdontExist' })
      async.series([
        manager1.start.bind(manager1),
        (next) => {
          manager2.start((err) => {
            helpers.assertValidationError(err, ['.store'])
            next()
          })
        }
      ], (err) => {
        if (err) throw err
        assert.ok(manager1._config.store instanceof persistence.NEDBStore)
        done()
      })
    })

    it('should restore saved state', (done) => {
      var managerConfig = { store: testDbDir, storeWriteTime: 1 }
        , manager = new ConnectionManager(managerConfig)
        , restoredManager = new ConnectionManager(managerConfig)

      // Change state of manager
      manager._nsTree.get('/bla/ho').lastMessage = ['hoho', 1, 'huhu']
      manager._nsTree.get('/blu').lastMessage = [122222.901]

      // Hack to wait for next save to persistence to be executed.
      // What happens otherwise is that there is race conditions causing tests to fail
      var _waitNextSave = (next) => {
        var store = manager._config.store
        store._managerSave = store.managerSave
        store.managerSave = function(state, done) {
          store._managerSave(state, (err) => {
            if (err) return done(err)
            store.managerSave = store._managerSave
            done()
            next()
          })
        }
      }

      async.series([
        manager.start.bind(manager),
        _waitNextSave,
        restoredManager.start.bind(restoredManager),
        (next) => {
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

  describe('open', () => {
    var store = new persistence.NEDBStore(testDbDir)
      , connections = new ConnectionManager({ store: store, collectStats: true, storeWriteTime: 1 })
    beforeEach((done) => { connections.start(done) })
    afterEach((done) => { connections.stop(done) })    

    it('should open properly and log events if collectStats', (done) => {
      var connection = new helpers.DummyConnection()
      connection.id = '1234'

      connections.open(connection, (err) => {
        if (err) throw err
        assert.deepEqual(connections._openConnections, [connection])

        // As the event is created after the connection has been opened,
        // without acknowledgement, we need to wait before it is inserted
        var events = []
        async.whilst(
          () => events.length < 1,
          (next) => {
            store.eventList((err, eList) => {
              events = eList
              setTimeout(next.bind(this, err), 20)
            })
          },
          (err) => {
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

  describe('close', () => {
    var store = new persistence.NEDBStore(testDbDir)
      , connections = new ConnectionManager({ store: store, collectStats: true, storeWriteTime: 1 })
    beforeEach((done) => { connections.start(done) })
    afterEach((done) => { connections.stop(done) })    

    it('should close properly and log events if collectStats', (done) => {
      var connection = new helpers.DummyConnection()
      connection.id = '5678'

      async.series([
        connections.open.bind(connections, connection),
        // Wait a bit so 'open' and 'close' events are not simultaneous
        (next) => setTimeout(next.bind(this, null), 10),
        connections.close.bind(connections, connection)

      ], (err) => {
        if (err) throw err
        assert.deepEqual(connections._openConnections, [])

        // As the event is created after the connection has been closed,
        // without acknowledgement, we need to wait before it is inserted
        var events = []
        async.whilst(
          () => events.length < 2,
          (next) => {
            store.eventList((err, eList) => {
              events = eList
              setTimeout(next.bind(this, err), 20)
            })
          },
          (err) => {
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

  describe('send', () => {

    var connections = new ConnectionManager({store: new persistence.NEDBStore(testDbDir)})
    beforeEach((done) => { connections.start(done) })
    afterEach((done) => { connections.stop(done) })

    it('should send messages from subspaces', (done) => {
      var received = []
        , connection = new helpers.DummyConnection((address, args) => received.push([address, args]))
      connection.id = '9abc'

      connections.open(connection, (err) => {
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

  describe('subscribe', () => {

    var connections = new ConnectionManager({store: new persistence.NEDBStore(testDbDir)})
    beforeEach((done) => { connections.start(done) })
    afterEach((done) => { connections.stop(done) })

    it('should return an error message if address in not valid', (done) => {
      var connection = new helpers.DummyConnection()
      connection.id = 'defg'
      connections.open(connection, (err) => {
        if(err) throw err
        assert.ok(_.isString(connections.subscribe(connection, '')))
        assert.ok(_.isString(connections.subscribe(connection, 'bla')))
        assert.ok(_.isString(connections.subscribe(connection, '/sys/bla')))
        done()
      })
    })

  })

  describe('getOpenConnectionsIds', () => {

    var connections = new ConnectionManager({store: new persistence.NEDBStore(testDbDir)})
    beforeEach((done) => { connections.start(done) })
    afterEach((done) => { connections.stop(done) })

    it('should return an error message if address in not valid', (done) => {
      var connection = new helpers.DummyConnection()
        , connection2 = new helpers.DummyConnection()
      connection.id = 'defg'
      connection2.id = 'hijk'

      async.series([
        connections.open.bind(connections, connection),
        connections.open.bind(connections, connection2)
      ], (err) => {
        if(err) throw err
        assert.deepEqual(connections.getOpenConnectionsIds('dummy'), ['defg', 'hijk'])
        done()
      })
    })

  })

})
