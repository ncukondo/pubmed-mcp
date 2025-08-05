import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'PubmedMCP',
      fileName: 'index',
      formats: ['es']
    },
    rollupOptions: {
      external: ['fs', 'path', 'fs/promises', 'node:process']
    },
    target: 'node18'
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
});