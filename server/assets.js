export async function handleAssetsRequest({ request, response, url, env, api }) {
  const { sendJson, sendStoredImage, sendLimitedImage, readStoredImage } = api
    if (request.method === 'GET' && url.pathname.startsWith('/api/case-images/')) {
      const objectPath = decodeURIComponent(url.pathname.slice('/api/case-images/'.length))
      if (!/^(main|other|items)\/[a-z0-9-]+\.png$/.test(objectPath)) {
        sendJson(response, 404, { error: 'Case image not found.' })
        return true
      }
      const itemImage = objectPath.match(/^items\/(\d+)\.png$/)
      if (itemImage) {
        // Uploaded artwork in the case-images bucket wins; otherwise fall back to
        // the Roblox thumbnail (and its placeholder when that host is unreachable).
        const stored = await readStoredImage(env, 'case-images', objectPath)
        if (stored?.body) {
          response.statusCode = 200
          response.setHeader('Content-Type', stored.contentType)
          // Artwork is replaced in place at the same asset-id filename, so keep
          // this revalidatable instead of immutable.
          response.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=60')
          response.end(stored.body)
          return true
        }
        await sendLimitedImage(response, Number(itemImage[1]))
        return true
      }
      await sendStoredImage(response, env, 'case-images', objectPath, 'Case')
      return true
    }

    if (request.method === 'GET' && url.pathname.startsWith('/api/casino-images/')) {
      const objectPath = decodeURIComponent(url.pathname.slice('/api/casino-images/'.length))
      if (!/^(dice|coinflip|mines|x-roulette)\/[a-zA-Z0-9_.-]+\.(?:avif|jpe?g|png|webp)$/.test(objectPath)) {
        sendJson(response, 404, { error: 'Casino image not found.' })
        return true
      }
      await sendStoredImage(response, env, 'casino-images', objectPath, 'Casino')
      return true
    }

    if (request.method === 'GET' && /^\/api\/limited-items\/\d+\/image$/.test(url.pathname)) {
      const assetId = Number(url.pathname.split('/')[3])
      await sendLimitedImage(response, assetId)
      return true
    }

  return false
}

