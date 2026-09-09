import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/live/filma-playback.live.test.ts'],
    passWithNoTests: false,
    restoreMocks: true,
    testTimeout: 30_000,
  },
})
