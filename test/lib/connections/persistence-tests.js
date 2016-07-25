"use strict";
var assert = require('assert')
  , fs = require('fs')
  , async = require('async')
  , rimraf = require('rimraf')
  , persistence = require('../../../lib/connections/persistence')
  , helpers = require('../../helpers-backend')

describe('persistence', () => {

  describe('NEDBStore', () => {

    var testDbDir = '/tmp/rhizome-test-db'
      , store = new persistence.NEDBStore(testDbDir)

    var connectionExists = (connection, done) => {
      var query = { connectionId: connection.id, namespace: connection.namespace }
      store._connectionsCollection.findOne(query, (err, doc) => {
        done(err, Boolean(doc))
      })
    }

    beforeEach((done) => {
      async.series([
        rimraf.bind(rimraf, testDbDir),
        fs.mkdir.bind(fs, testDbDir),
        store.start.bind(store)
      ], done)
    })
    afterEach((done) => { store.stop(done) })
    
    describe('connectionInsertOrRestore', () => {

      it('should insert connections that dont exist and restore the others', (done) => {
        var connection1 = new helpers.DummyConnection()
          , connection2 = new helpers.DummyConnection()
          , restoredConnection
        connection1.testData = {a: 1, b: 2}
        connection1.id = '9abc'
        connection2.testData = {c: 3, d: 4}
        connection2.id = 'fghj'

        async.series([
          // Check that connections indeed dont exist
          connectionExists.bind(this, connection1),
          connectionExists.bind(this, connection2),

          // Insert connections
          store.connectionInsertOrRestore.bind(store, connection1),
          store.connectionInsertOrRestore.bind(store, connection2),
          
          // Check that now they do exist
          connectionExists.bind(this, connection1),
          connectionExists.bind(this, connection2),

          // Restore a connection
          (next) => {
            restoredConnection = new helpers.DummyConnection()
            restoredConnection.id = '9abc'
            assert.equal(connection1.restoredTestData, null)
            assert.equal(connection2.restoredTestData, null)
            store.connectionInsertOrRestore(restoredConnection, next)
          }

        ], (err, results) => {
          if (err) throw err
          var existed1Before = results.shift()
            , existed2Before = results.shift()
          results.shift()
          results.shift()
          var existed1After = results.shift()
            , existed2After = results.shift()

          assert.equal(existed1Before, false)
          assert.equal(existed2Before, false)
          assert.equal(existed1After, true)
          assert.equal(existed2After, true)
          assert.deepEqual(restoredConnection.restoredTestData, {a: 1, b: 2})
          done()
        })

      })

      it('should insert connections and automatically assign id if null', (done) => {
        var connection = new helpers.DummyConnection()
        connection.testData = {a: 1, b: 2}
        assert.equal(connection.id, null)
        store.connectionInsertOrRestore(connection, (err, results) => {
          if (err) throw err
          assert.ok(connection.id !== null)
          assert.ok(connection.id.length > 4)
          done()
        })
      })

      it('should assign a new id when autoId is true and connection could not be restored', (done) => {
        var connection = new helpers.DummyConnection()
          , id = 'Idontexist'
        connection.id = id
        connection.autoId = true
        store.connectionInsertOrRestore(connection, (err, results) => {
          if (err) throw err
          assert.ok(connection.id !== null)
          assert.ok(connection.id.length > 4)
          assert.ok(connection.id != id)
          done()
        })
      })

    })

    describe('connectionUpdate', () => {

      it('should update connections that exist', (done) => {
        var connection = new helpers.DummyConnection()
          , restoredConnection = new helpers.DummyConnection()
        connection.testData = {a: 1, b: 2}
        connection.id = '9abc'
        restoredConnection.id = connection.id

        async.series([
          store.connectionInsertOrRestore.bind(store, connection),
          (next) => {
            connection.testData = {c: 8, d: 99}
            store.connectionUpdate(connection, next)
          },
          store.connectionInsertOrRestore.bind(store, restoredConnection)
        ], (err, results) => {
          if (err) throw err
          assert.deepEqual(restoredConnection.restoredTestData, {c: 8, d: 99})
          done()
        })

      })

    })

    describe('connectionIdList', () => {

      it('should list connection ids', (done) => {
        var connection1 = new helpers.DummyConnection()
          , connection2 = new helpers.DummyConnection()
          , connection3 = new helpers.DummyConnection()
          , connection4 = new helpers.DummyConnection()
        connection1.id = 'defg'
        connection2.id = 'hijk'
        connection3.id = 'lmno'
        connection4.id = 'pqrs'

        async.series([
          store.connectionInsertOrRestore.bind(store, connection1),
          store.connectionInsertOrRestore.bind(store, connection2),
          store.connectionInsertOrRestore.bind(store, connection3),
          store.connectionIdList.bind(store, 'dummy')
        ], (err, results) => {
          if (err) throw err
          var idList = results.pop()
          idList.sort()
          assert.deepEqual(idList, ['defg', 'hijk', 'lmno'])
          done()
        })
      })

    })

    describe('eventInsert', () => {

      it('should insert events in the store', (done) => {
        var event1 = { timestamp: +(new Date), eventType: 'open', id: 'john', namespace: 'people' }
          , event2 = { timestamp: +(new Date) + 10, eventType: 'close', id: 'jack', namespace: 'people' }
          , event3 = { timestamp: +(new Date) + 100, eventType: 'start', id: 'jimi', namespace: 'people' }

        async.series([
          store.eventList.bind(store),
          store.eventInsert.bind(store, [event1, event3]),
          store.eventList.bind(store),
          store.eventInsert.bind(store, [event2]),
          store.eventList.bind(store)
        ], (err, results) => {
          if (err) throw err
          assert.deepEqual(results.shift(), [])
          results.shift()
          helpers.assertSameElements(results.shift(), [event1, event3])
          results.shift()
          helpers.assertSameElements(results.shift(), [event1, event2, event3])
          done()
        })
      })

    })

    describe('managerSave/managerRestore', () => {

      it('should save/restore manager state', (done) => {
        var state = {
          nsTree: [{a: 5678, b: 122121}, {c: 888, b: 122121}],
          idCounters: {blabla: 1234}
        }
        async.series([
          store.managerSave.bind(store, state),
          store.managerRestore.bind(store)
        ], (err, results) => {
          if (err) throw err
          var restored = results.pop()
          assert.deepEqual(restored, state)
          done()
        })
      })

      it('should return null if no state saved', (done) => {
        store.managerRestore((err, state) => {
          if (err) throw err
          assert.equal(state, null)
          done()
        })
      })

      it('should handle buffers', (done) => {
        var state = {nsTree: [
          {address: '/', lastMessage: [122121]},
          {address: '/bla', lastMessage: ['hello', new Buffer('blabla'), 1234]}
        ]}
        async.series([
          store.managerSave.bind(store, state),
          store.managerRestore.bind(store)
        ], (err, results) => {
          if (err) throw err
          var restored = results.pop()
          assert.deepEqual(restored, {nsTree: [
            {address: '/', lastMessage: [122121]},
            {address: '/bla', lastMessage: ['hello', new Buffer(''), 1234]}
          ]})
          done()
        })
      })

      it('shouldnt crash if manager state is missing fields or invalid', (done) => {
        
        async.series([
          fs.writeFile.bind(fs, store._managerFile, JSON.stringify({})),
          store.managerRestore.bind(store)
        ], done)
      })

    })

  })

})