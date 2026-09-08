import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'
import { defineConfig } from 'vite'

const frameIsolationHeaders = {
  'Content-Security-Policy': "frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
}

export default defineConfig(() => {
  const verifyBuild = process.env.PLAY_VERIFY_BUILD === 'true'
  return {
    root: 'src/admin',
    plugins: [
      react(),
      cloudflare({
        configPath: verifyBuild
          ? '../../tests/worker/fixtures/wrangler.test.jsonc'
          : '../../wrangler.jsonc',
        ...(verifyBuild
          ? {}
          : { persistState: { path: '../../.wrangler/state' } }),
      }),
    ],
    server: { host: '127.0.0.1', headers: frameIsolationHeaders },
    build: {
      emptyOutDir: true,
      outDir: '../../dist/admin',
    },
  }
})
