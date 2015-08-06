module.exports = {
  
  osc: {
    port: 9000
  },

  websockets: {
    maxSockets: 5,
  },

  http: {
    port: 8000,
    staticDir: './pages'
  },
  
  connections: {
    store: '/tmp/blabla'
  }
}
