import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { roriskApi } from './server/index.js'

export default defineConfig(({ mode }) => {
  const loadedEnv = loadEnv(mode, '.', '')
  const serverEnv = Object.freeze({
    SUPABASE_URL: loadedEnv.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: loadedEnv.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_SECRET_KEY: loadedEnv.SUPABASE_SECRET_KEY,
    RORISK_USER_SECRET: loadedEnv.RORISK_USER_SECRET,
    HCAPTCHA_SECRET: loadedEnv.HCAPTCHA_SECRET,
    HCAPTCHA_SITE_KEY: loadedEnv.HCAPTCHA_SITE_KEY || loadedEnv.VITE_HCAPTCHA_SITE_KEY,
    NOWPAYMENTS_API_KEY: loadedEnv.NOWPAYMENTS_API_KEY,
    NOWPAYMENTS_IPN_SECRET: loadedEnv.NOWPAYMENTS_IPN_SECRET,
    NOWPAYMENTS_IPN_BASE_URL: loadedEnv.NOWPAYMENTS_IPN_BASE_URL,
  })

  return {
    envPrefix: 'PUBLIC_CLIENT_',
    build: { sourcemap: false },
    plugins: [roriskApi(serverEnv), react()],
    server: {
      // A leading dot allows every subdomain, so any Render service URL works
      // without editing this file when the service is recreated.
      allowedHosts: ['.onrender.com', 'rowild.lol', 'www.rowild.lol'],
      host: '0.0.0.0',
    },
    preview: {
      allowedHosts: ['.onrender.com', 'rowild.lol', 'www.rowild.lol'],
      host: '0.0.0.0',
      port: 10000, 
      strictPort: true, 
    },
  }
})
