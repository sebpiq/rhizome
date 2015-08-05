module.exports = {
  
  osc: {
    port: 9000
  },

  websockets: {
    usersLimit: 5,
  },

  http: {
    port: 8000,
    staticDir: './pages'
  },
  
  connections: {
    store: '/tmp/blabla'
  }
}
