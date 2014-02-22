module.exports = {

  webPort: 8001
  oscPort: 9000
  pages: [
    { rootUrl: '/example', dirName: './pages' }
  ]
  clients: [
    { ip: '127.0.0.1', oscPort: 9001 }
  ]
}
