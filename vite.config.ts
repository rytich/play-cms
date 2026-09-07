import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  root: 'src/admin',
  plugins: [
    react(),
    cloudflare({
      configPath: '../../wrangler.jsonc',
      persistState: { path: '../../.wrangler/state' },
    }),
  ],
  server: { host: '127.0.0.1' },
  build: {
    emptyOutDir: true,
    outDir: '../../dist/admin',
  },
})
