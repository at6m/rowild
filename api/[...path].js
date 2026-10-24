import { handleRequest, SECURITY_HEADERS, supabaseRequest } from '../server/index.js'
import { startSimulatedBets } from '../server/liveBets.js'

/**
 * Vercel entry point for every /api/* route except the WebSocket endpoint.
 *
 * Vite's dev/preview middleware and this function call the same handleRequest,
 * so behaviour cannot drift between local development and production. The only
 * difference is where configuration comes from: process.env instead of the
 * values vite.config.js loads from .env.
 */
const env = process.env

let bootstrapped = false
function bootstrap() {
  if (bootstrapped) return
  bootstrapped = true
  if (env.SUPABASE_URL) startSimulatedBets(env, supabaseRequest)
}

export default async function handler(request, response) {
  bootstrap()
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.setHeader(name, value)

  const handled = await handleRequest(request, response, env)
  if (handled) return

  response.statusCode = 404
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify({ error: 'Not found.' }))
}
