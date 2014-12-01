var path = require('path')
  , _ = require('underscore')
  , jetty = new (require('jetty'))(process.stdout)
  , WebClient = require('../lib/websockets/Client')
  , timeStarted = +(new Date)
  , echoClient, clients = [], connected = []
  , config

// Parsing parameters, and getting config file
if (process.argv.length !== 3) {
  console.error('> usage : node ' + path.basename(process.argv[1]) + ' config-file.js')
  process.exit(1)
}
config = require(process.argv[2])

// The client that listens for messages and echoes back
echoClient = new WebClient({
  'hostname': config.hostname,
  'port': config.port
})
 
echoClient.on('connected', function() {
  console.log('echo client connected')
  echoClient.send('/sys/subscribe', ['/'])
})

echoClient.on('reconnected', function() {
  echoClient.send('/sys/subscribe', ['/'])
})

echoClient.on('message', function(address, args) {
  if (address !== '/echo') return
  var userId = args[0]
    , timestamp = args[1]
    , client = _.find(clients, function(c) { return c.userId === userId })
  client.stats.cumRoundTripTime += (+(new Date) - args[1])
  client.stats.countReceivedMessages++
})

echoClient.start(function(err) {
  if (err) throw err
})


// Building several web client
_.range(config.connections).forEach(function() {
  var client = new WebClient({
    'hostname': config.hostname,
    'port': config.port
  })
  clients.push(client)
  client.stats = {
    cumRoundTripTime: 0,
    countReceivedMessages: 0,
    countSentMessages: 0,
  }

  client.on('connected', function() {
    connected.push(client)
    console.log('client, ID ' + client.userId + ' connected')
    if (_.intersection(connected, clients).length === config.connections)
      onAllClientsConnected()
  })

  client.on('connection lost', function() {
    console.log('LOST client, ID ' + client.userId)
  })

  client.on('reconnected', function() {
    console.log('reconnected, ID ' + client.userId)
  })

  client.start(function(err) {
    if (err) throw err
  })
})

var onAllClientsConnected = function() {
  console.log('' + clients.length + ' clients connected')

  setInterval(function() {
    clients.filter(function(c) { return c.userId !== null }).forEach(function(c) {
      c.send('/echo', [c.userId, +(new Date)])
      c.stats.countSentMessages++
    })
  }, config.sendInterval)
}

setInterval(function() {
  var totalReceivedMessages, totalSentMessages, avgRoundTripTime
  totalReceivedMessages = clients.reduce(function(cum, c) {
    return cum + c.stats.countReceivedMessages
  }, 0)
  totalSentMessages = clients.reduce(function(cum, c) {
    return cum + c.stats.countSentMessages
  }, 0)
  avgRoundTripTime = clients.reduce(function(cum, c) {
    return cum + c.stats.cumRoundTripTime
  }, 0) / totalReceivedMessages

  jetty.clear()
  jetty.text('- echo client: \t\t\t\t' + echoClient.status() + '\n')
  jetty.text('- clients ready: \t\t\t' + clients.reduce(function(cum, c) {
    if (c.userId !== null && c.status() === 'started') return cum + 1
    else return cum
  }, 0) + '\n')
  jetty.text('- total messages: \t\t\t' + totalReceivedMessages
    + '/' + (totalSentMessages - totalReceivedMessages) + '\t\t\t(sent/lost)\n')
  jetty.text('- avg round trip: \t\t\t' + Math.round(avgRoundTripTime * 1000) / 1000 + '\t\t\t(ms)\n')
  jetty.text('- time running: \t\t\t' + Math.round((+(new Date) - timeStarted) / 1000) + '\t\t\t(s)\n')
}, config.statsInterval)