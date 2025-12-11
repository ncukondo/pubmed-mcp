import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    // Unit tests - can run in parallel
    extends: './vite.config.ts',
    test: {
      name: 'unit',
      environment: 'node',
      globals: true,
      include: ['src/__tests__/*.test.ts'],
      exclude: ['src/__tests__/*.integration.test.ts'],
      // Enable parallel execution for unit tests
      fileParallelism: true,
      sequence: {
        concurrent: false
      },
      isolate: true
    }
  },
  {
    // Integration tests - must run sequentially to avoid API rate limiting
    extends: './vite.config.ts',
    test: {
      name: 'integration',
      environment: 'node',
      globals: true,
      include: ['src/__tests__/*.integration.test.ts'],
      // Disable parallel execution for integration tests
      fileParallelism: false,
      sequence: {
        concurrent: false
      },
      poolOptions: {
        forks: {
          singleFork: true
        }
      },
      isolate: true
    }
  }
]);
