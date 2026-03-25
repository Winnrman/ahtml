'use strict'

const net = require('net')

function findFreePort(preferred = 3000) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.listen(preferred, () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
    server.on('error', () => {
      // preferred port taken, let OS assign one
      const fallback = net.createServer()
      fallback.listen(0, () => {
        const { port } = fallback.address()
        fallback.close(() => resolve(port))
      })
    })
  })
}

module.exports = { findFreePort }
