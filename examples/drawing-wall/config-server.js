module.exports = {
  
  servers: [
    
    {
      type: 'osc',
      config: {
        port: 9000
      }
    },

    {
      type: 'websockets',
      config: {
        port: 8000,
        maxSockets: 5
      }
    },

    {
      type: 'http',
      config: {
        port: 8000,
        staticDir: './pages'
      }
    }

  ],
  
  connections: {
    store: '/tmp/blabla'
  }
}
