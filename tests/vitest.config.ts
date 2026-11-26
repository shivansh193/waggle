import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@waggle/kit': resolve(__dirname, '../packages/kit/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts'],
    reporter: ['verbose'],
    coverage: {
      reporter: ['text', 'json-summary'],
    },
  },
})
