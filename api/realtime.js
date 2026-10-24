import http from 'node:http'
import { hmac } from '../server/index.js'
import { attachRealtimeServer } from '../server/chat.js'

/**
 * Vercel serves /api/realtime from this function. Exporting the http.Server is
 * the supported way to hand WebSocket upgrades to a Node server, so the chat
 * code (rooms, presence, rain) runs unchanged.
 *
 * Vercel pins each socket to the instance that accepted it, and instances do
 * not share memory: a client that reconnects can land on a different instance
 * and see an empty room until someone posts there again. For a low-traffic
 * site this is invisible; moving rooms and presence to a shared store is the
 * fix if chat ever needs to span instances.
 */
const server = http.createServer((request, response) => {
  response.statusCode = 404
  response.setHeader('Content-Type', 'text/plain; charset=utf-8')
  response.end('Not found')
})

const secret = process.env.RORISK_USER_SECRET
attachRealtimeServer(server, secret ? (value) => hmac(value, secret) : null, process.env)

export default server
