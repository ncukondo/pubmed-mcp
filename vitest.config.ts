/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Include both regular test files and integration test files
    include: ['**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    // Run integration tests sequentially to avoid API rate limiting
    sequence: {
      concurrent: false
    },
    // Pool configuration for integration tests
    poolOptions: {
      forks: {
        singleFork: true
      }
    },
    // Run test files matching integration pattern in sequence
    fileParallelism: false
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
});