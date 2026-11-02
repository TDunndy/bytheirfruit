import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// A static SPA: Cloudflare Workers (static assets) serves dist/ at
// station.bytheirfruit.church with single-page-application fallback; the
// same build goes inside the Capacitor shells later. The browser talks to
// Supabase directly; authorization lives in Postgres.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@db': fileURLToPath(new URL('../../src/lib', import.meta.url)),
    },
  },
  build: { target: 'es2020', sourcemap: false },
})
