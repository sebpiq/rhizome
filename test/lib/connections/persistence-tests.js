var assert = require('assert')
  , fs = require('fs')
  , async = require('async')
  , rimraf = require('rimraf')
  , persistence = require('../../../lib/connections/persistence')
  , helpers = require('../../helpers')

describe('persistence', function() {

  describe('NEDBStore', function() {

    var testDbDir = '/tmp/rhizome-test-db'
      , store = new persistence.NEDBStore(testDbDir)

    beforeEach(function(done) {
      async.series([
        rimraf.bind(rimraf, testDbDir),
        fs.mkdir.bind(fs, testDbDir),
        store.start.bind(store)
      ], done)
    })
    afterEach(function(done) { store.stop(done) })
    
    describe('connectionExists', function() {
      
      it('should return true if the connection exists', function(done) {
        var connection = new helpers.DummyConnection()
        connection.id = '1234'
        async.series([
          store.connectionSave.bind(store, connection),
          store.connectionExists.bind(store, 'dummy', connection.id)
        ], function(err, results) {
          if (err) throw err
          var exists = results.pop()
          assert.equal(exists, true)
          done()
        })
      })
    
      it('should return true if the connection exists', function(done) {
        store.connectionExists('dummy', '5678', function(err, exists) {
          if (err) throw err
          assert.equal(exists, false)
          done()
        })
      })

    })

    describe('connectionSave', function() {

      it('should save a connection properly', function(done) {
        var connection = new helpers.DummyConnection()
        connection.testData = {a: 1, b: 2}
        connection.id = '9abc'

        async.series([
          store.connectionExists.bind(store, 'dummy', connection.id),
          store.connectionSave.bind(store, connection), // insert
          store.connectionRestore.bind(store, connection),
          function(next) {
            assert.deepEqual(connection.restoredTestData, {a: 1, b: 2})
            connection.testData = {a: 3, c: 4}
            store.connectionSave(connection, next) // update
          },
          store.connectionRestore.bind(store, connection),

        ], function(err, results) {
          if (err) throw err
          var existed = results.shift()
          assert.equal(existed, false)
          assert.deepEqual(connection.restoredTestData, {a: 3, c: 4})
          done()
        })

      })

    })

    describe('connectionRestore', function() {

      it('should throw an error if the connection doesnt exist', function(done) {
        var connection = new helpers.DummyConnection()
        connection.id = 'defg'
        connection.testData = 12345
        store.connectionRestore(connection, function(err) {
          assert.equal(connection.restoredTestData, undefined)
          assert.ok(err)
          done()
        })
      })

    })

    describe('connectionIdList', function() {

      it('should list connection ids', function(done) {
        var connection1 = new helpers.DummyConnection()
          , connection2 = new helpers.DummyConnection()
          , connection3 = new helpers.DummyConnection()
          , connection4 = new helpers.DummyConnection()
        connection1.id = 'defg'
        connection2.id = 'hijk'
        connection3.id = 'lmno'
        connection4.id = 'pqrs'

        async.series([
          store.connectionSave.bind(store, connection1),
          store.connectionSave.bind(store, connection2),
          store.connectionSave.bind(store, connection3),
          store.connectionIdList.bind(store, 'dummy')
        ], function(err, results) {
          if (err) throw err
          var idList = results.pop()
          assert.deepEqual(idList, ['defg', 'hijk', 'lmno'])
          done()
        })
      })

    })

    describe('eventInsert', function() {

      it('should insert events in the store', function(done) {
        var event1 = { timestamp: +(new Date), eventType: 'open', id: 'john', namespace: 'people' }
          , event2 = { timestamp: +(new Date) + 10, eventType: 'close', id: 'jack', namespace: 'people' }
          , event3 = { timestamp: +(new Date) + 100, eventType: 'start', id: 'jimi', namespace: 'people' }

        async.series([
          store.eventList.bind(store),
          store.eventInsert.bind(store, event1),
          store.eventInsert.bind(store, event3),
          store.eventList.bind(store),
          store.eventInsert.bind(store, event2),
          store.eventList.bind(store)
        ], function(err, results) {
          if (err) throw err
          assert.deepEqual(results.shift(), [])
          results.shift()
          results.shift()
          helpers.assertSameElements(results.shift(), [event1, event3])
          results.shift()
          helpers.assertSameElements(results.shift(), [event1, event2, event3])
          done()
        })
      })

    })

  })

})