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

// INFO
// This is a benchmark testing the round-trip latency between messages.
// Several clients send a timestamped message to the server, and an "echo"
// client receives the echo, measuring the round-trip time.
// Then, if the average round-trip time is below a certain threshold, we try
// to put more load by adding more clients. 

var path = require('path')
  , _ = require('underscore')
  , stats = require('stats-lite')
  , WebClient = require('../lib/websockets/Client')
  , timeStarted = +(new Date)
  , echoClient, clients = [], connected = []

// CONFIG
var initialConnections = 10       // Initial number of connections 
  , timesWindowSize = 100         // Size of the window for the running avg of the round-trip time
  , statsInterval = 500           // Interval at which stats are displayed
  , maxAvgTime = 80               // When avg gets above this, we stop creating more clients
  , maxTimeDev = 40               // When std dev gets above this, we stop creating more clients
  , sendInterval = 50             // Interval at which we send messages
  , optimizeInterval = timesWindowSize * sendInterval * 2

// Parsing parameters
if (process.argv.length !== 4) {
  console.error('> usage : node ' + path.basename(process.argv[1]) + ' <hostname> <port>')
  process.exit(1)
}

var hostname = process.argv[2]
  , port = parseInt(process.argv[3], 10)

// ==================== Echo ==================== //
echoClient = new WebClient({ 'hostname': hostname, 'port': port })
echoClient.on('connected', function() { echoClient.send('/sys/subscribe', ['/']) })
echoClient.on('connection lost', function() { console.log('LOST echo client') })

echoClient.on('message', function(address, args) {
  if (address !== '/echo') return

  // Collecting stats
  var id = args[0], roundTripTime = (+(new Date) - args[1])
    , timestamp = args[1]
    , client = _.find(clients, function(c) { return c.id === id })
  client.stats.cumTime += roundTripTime
  client.stats.rcvCount++
  client.stats.times.push(roundTripTime)
  client.stats.lostCount = client.stats.sentCount - client.stats.rcvCount
  if (client.stats.times.length > timesWindowSize) client.stats.times.shift()
})

echoClient.start(function(err) { if (err) throw err })

// ==================== Connections ==================== //
var createClient = function() {
  var client = new WebClient({ 'hostname': hostname, 'port': port })

  clients.push(client)
  client.stats = {
    cumTime: 0,
    rcvCount: 0,
    sentCount: 0,
    lostCount: 0,
    times: []
  }

  client.on('connected', function() { connected.push(client) })
  client.on('connection lost', function() {
    console.log('LOST client, ID ' + client.id)
    connected = _.without(connected, client)
  })
  client.start(function(err) { if (err) throw err })
}

// Loop for sending messages
setInterval(function() {
  connected.forEach(function(c) {
    c.send('/echo', [c.id, +(new Date)])
    c.stats.sentCount++
  })
}, sendInterval)

// Loop for adding more clients if the load is low enough
setInterval(function() {
  var allTimes = clients.reduce(function(all, c) { return all.concat(c.stats.times) }, [])
  if (stats.mean(allTimes) < maxAvgTime && stats.stdev(allTimes) < maxTimeDev)
    createClient()
}, optimizeInterval)

// Create initial number of clients
_.range(initialConnections).forEach(createClient)

// ==================== Print STATS ==================== //
var cols = ['t. running', 'echo', 'clients', 'sent/lost', 'running avg', ' running dev']
  , colMax = _.max(cols.map(function(col) { return col.length }))
  , colSize = colMax + 2
  , i = 0, length

var printRow = function(row) {
  row = row.map(function(cell) {
    cell = '' + cell
    if (cell.length > colSize)
      return cell.slice(0, colSize)
    else if (cell.length < colSize) {
      for (i = 0, length = Math.floor((colSize - cell.length) / 2); i < length; i++)
        cell = ' ' + cell
      for (i = 0, length = colSize - cell.length; i < length; i++)
        cell = cell + ' '
      return cell
    } else return cell
  })
  process.stdout.write('| ' + row.join(' | ') + ' |')
}
printRow(cols)
process.stdout.write('\n')

setInterval(function() {
  var rcvTotal, sentTotal, totalCumTime, allTimes

  rcvTotal = stats.sum(clients.map(function(c) { return c.stats.rcvCount }))
  sentTotal = stats.sum(clients.map(function(c) { return c.stats.sentCount }))
  totalCumTime = stats.sum(clients.map(function(c) { return c.stats.cumTime }))
  allTimes = clients.reduce(function(all, c) { return all.concat(c.stats.times) }, [])

  process.stdout.clearLine()
  process.stdout.cursorTo(0)
  printRow([
    ('' + Math.round((+(new Date) - timeStarted) / 1000)) + ' s',
    echoClient.status(), 
    connected.length,
    rcvTotal + '/' + (sentTotal - rcvTotal),
    ('' + Math.round(stats.mean(allTimes) * 1000) / 1000) + ' ms',
    stats.stdev(allTimes).toString().slice(0, 6) + ' ms'
  ])
}, statsInterval)