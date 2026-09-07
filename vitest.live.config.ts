import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/live/**/*.live.test.ts'],
    passWithNoTests: false,
    restoreMocks: true,
    testTimeout: 15_000,
  },
})
