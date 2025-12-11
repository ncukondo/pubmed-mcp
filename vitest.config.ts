/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { resolve } from 'path';

// This is the base config used by vitest.workspace.ts
// When running all tests, use vitest.workspace.ts which separates
// unit tests (parallel) from integration tests (sequential)
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['**/*.{test,spec}.?(c|m)[jt]s?(x)']
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
});