import { handleRequest, SECURITY_HEADERS, routeApi, supabaseRequest } from '../server/index.js'
import { startSimulatedBets } from '../server/liveBets.js'
import { startBotAttendance } from '../server/botPlayers.js'

/**
 * The one function every /api route lands on.
 *
 * Vercel's file router only maps one path segment per function here, so nested
 * routes such as /api/auth/config or /api/payments/nowpayments/config never
 * reached a handler and returned Vercel's own 404. vercel.json rewrites those
 * requests to /api and lets Vercel pass the rest of the path as a `route` query
 * parameter, which is turned back into the original URL before routing.
 */
const env = process.env

let bootstrapped = false
function bootstrap() {
  if (bootstrapped) return
  bootstrapped = true
  if (env.SUPABASE_URL) {
    startSimulatedBets(env, supabaseRequest)
    startBotAttendance(env, supabaseRequest, routeApi)
  }
}

function restoreApiUrl(rawUrl) {
  const url = new URL(rawUrl, 'http://localhost')
  const route = url.searchParams.get('route')
  if (url.pathname !== '/api' || !route) return rawUrl
  url.searchParams.delete('route')
  const query = url.searchParams.toString()
  return `/api/${route.replace(/^\/+/, '')}${query ? `?${query}` : ''}`
}

export default async function handler(request, response) {
  bootstrap()
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.setHeader(name, value)

  request.url = restoreApiUrl(request.url)
  const handled = await handleRequest(request, response, env)
  if (handled) return

  response.statusCode = 404
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify({ error: 'Not found.' }))
}
