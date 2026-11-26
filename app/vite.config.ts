import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    alias: {
      '@waggle/kit': resolve(__dirname, '../packages/kit/src/index.ts'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        join: resolve(__dirname, 'join/index.html'),
      },
    },
  },
})
