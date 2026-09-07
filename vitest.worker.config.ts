import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations('./migrations'),
          PLAY_LOCAL_ONLY: 'true',
          PLAY_BOOTSTRAP_TOKEN: 'a'.repeat(64),
          PLAY_RATE_LIMIT_KEY: 'b'.repeat(64),
        },
      },
    }),
  ],
  test: {
    include: ['tests/worker/**/*.test.ts'],
    setupFiles: ['./tests/worker/setup.ts'],
    testTimeout: 20000,
  },
}))
