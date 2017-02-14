"use strict";
var assert = require('assert')
  , fs = require('fs')
  , _ = require('underscore')
  , async = require('async')
  , ConnectionManager = require('../../../lib/connections/ConnectionManager')
  , persistence = require('../../../lib/connections/persistence')
  , coreUtils = require('../../../lib/core/utils')
  , helpers = require('../../helpers-backend')


describe('connections.ConnectionManager', () => {
 
  beforeEach((done) => helpers.beforeEach(done))

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
        manager1.stop(done)
      })
    })

    it('should restore saved state', (done) => {
      var managerConfig = { store: helpers.testDbDir, storeWriteTime: 1 }
        , manager = new ConnectionManager(managerConfig)
        , restoredManager = new ConnectionManager(managerConfig)

      // Change state of manager
      manager._nsTree.get('/bla/ho').lastMessage = ['hoho', 1, 'huhu']
      manager._nsTree.get('/blu').lastMessage = [122222.901]

      async.series([
        manager.start.bind(manager),

        // Hack to wait for next save to persistence to be executed.
        // What happens otherwise is that there is race conditions causing tests to fail
        (next) => {
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
        },
        
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
    var store = new persistence.NEDBStore(helpers.testDbDir)
      , manager = new ConnectionManager({ store: store, storeWriteTime: 1 })
    beforeEach((done) => { manager.start(done) })
    afterEach((done) => { manager.stop(done) })    

    it('should open connection properly', (done) => {
      var connection = new helpers.DummyConnection([ () => {}, '1234' ])
      manager.open(connection, (err) => {
        if (err) throw err
        assert.deepEqual(manager._openConnections, [connection])
        done()
      })
    })

  })

  describe('close', () => {
    var store = new persistence.NEDBStore(helpers.testDbDir)
      , manager = new ConnectionManager({ store: store, storeWriteTime: 1 })
    beforeEach((done) => { manager.start(done) })
    afterEach((done) => { manager.stop(done) })    

    it('should close connection properly', (done) => {
      var connection = new helpers.DummyConnection([ () => {}, '5678' ])
      async.series([
        manager.open.bind(manager, connection),
        // Wait a bit so 'open' and 'close' events are not simultaneous
        (next) => setTimeout(next.bind(this, null), 10),
        manager.close.bind(manager, connection)

      ], (err) => {
        if (err) throw err
        assert.deepEqual(manager._openConnections, [])
        done()
      })
    })

  })

  describe('send', () => {

    var manager = new ConnectionManager({store: new persistence.NEDBStore(helpers.testDbDir)})
    beforeEach((done) => { manager.start(done) })
    afterEach((done) => { manager.stop(done) })

    it('should send messages from subspaces', (done) => {
      var received = []
        , connection = new helpers.DummyConnection([ 
          (address, args) => received.push([address, args]), 
          '9abc'
        ])

      manager.open(connection, (err) => {
        if(err) throw err
        manager.subscribe(connection, '/a')
        assert.equal(manager.send('/a', [44]), null)
        assert.equal(manager.send('/a/b', [55]), null)
        assert.equal(manager.send('/', [66]), null)
        assert.equal(manager.send('/c', [77]), null)
        assert.equal(manager.send('/a/d', [88]), null)
        assert.equal(manager.send('/a/', [99]), null)

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

    var manager = new ConnectionManager({store: new persistence.NEDBStore(helpers.testDbDir)})
    beforeEach((done) => { manager.start(done) })
    afterEach((done) => { manager.stop(done) })

    it('should return an error message if address in not valid', (done) => {
      var connection = new helpers.DummyConnection([ () => {}, 'defg' ])
      manager.open(connection, (err) => {
        if(err) throw err
        assert.ok(_.isString(manager.subscribe(connection, '')))
        assert.ok(_.isString(manager.subscribe(connection, 'bla')))
        assert.ok(_.isString(manager.subscribe(connection, '/sys/bla')))
        done()
      })
    })

  })

  describe('isSubscribed', () => {

    var manager = new ConnectionManager({store: new persistence.NEDBStore(helpers.testDbDir)})
    beforeEach((done) => { manager.start(done) })
    afterEach((done) => { manager.stop(done) })

    it('should return true if connection subscribed, false otherwise', (done) => {
      var connection = new helpers.DummyConnection([ () => {}, 'defg' ])
      manager.open(connection, (err) => {
        if(err) return done(err)
        assert.ok(!manager.isSubscribed(connection, '/bla'))
        manager.subscribe(connection, '/bla')
        assert.ok(manager.isSubscribed(connection, '/bla'))
        assert.ok(!manager.isSubscribed(connection, '/'))
        assert.ok(!manager.isSubscribed(connection, '/blo'))
        done()
      })
    })

  })

  describe('getOpenConnectionsIds', () => {

    var manager = new ConnectionManager({store: new persistence.NEDBStore(helpers.testDbDir)})
    beforeEach((done) => { manager.start(done) })
    afterEach((done) => { manager.stop(done) })

    it('should return an error message if address in not valid', (done) => {
      var connection = new helpers.DummyConnection([ () => {}, 'defg' ])
        , connection2 = new helpers.DummyConnection([ () => {}, 'hijk' ])
      async.series([
        manager.open.bind(manager, connection),
        manager.open.bind(manager, connection2)
      ], (err) => {
        if(err) throw err
        assert.deepEqual(manager.getOpenConnectionsIds('dummy'), ['defg', 'hijk'])
        done()
      })
    })

  })

})
