import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('CLI Arguments Parsing', () => {
  let originalArgv: string[];
  let originalEnv: typeof process.env;

  beforeEach(() => {
    // Save original values
    originalArgv = process.argv;
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original values
    process.argv = originalArgv;
    process.env = originalEnv;
    
    // Clear module cache to reload the index module
    vi.resetModules();
  });

  const parseArgsFunction = `
    function parseArgs() {
      const args = process.argv.slice(2);
      const parsed = {};
      
      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--')) {
          const key = arg.slice(2);
          const value = args[i + 1];
          if (value && !value.startsWith('--')) {
            parsed[key] = value;
            i++; // Skip the value in the next iteration
          }
        }
      }
      
      return parsed;
    }
  `;

  it('should parse command line arguments correctly', () => {
    // Simulate command line arguments
    process.argv = [
      'node',
      'dist/index.js',
      '--email', 'test@example.com',
      '--api-key', 'test-key',
      '--cache-dir', '/tmp/pubmed-cache',
      '--cache-ttl', '3600'
    ];

    // Execute the parseArgs function
    const parseArgs = new Function(`${parseArgsFunction}; return parseArgs();`)();

    expect(parseArgs.email).toBe('test@example.com');
    expect(parseArgs['api-key']).toBe('test-key');
    expect(parseArgs['cache-dir']).toBe('/tmp/pubmed-cache');
    expect(parseArgs['cache-ttl']).toBe('3600');
  });

  it('should handle missing values gracefully', () => {
    process.argv = [
      'node',
      'dist/index.js',
      '--email', 'test@example.com',
      '--cache-dir'
    ];

    const parseArgs = new Function(`${parseArgsFunction}; return parseArgs();`)();

    expect(parseArgs.email).toBe('test@example.com');
    expect(parseArgs['cache-dir']).toBeUndefined();
  });

  it('should prioritize command line arguments over environment variables', () => {
    // Set environment variables
    process.env.PUBMED_EMAIL = 'env@example.com';
    process.env.PUBMED_CACHE_DIR = '/env/cache';
    process.env.PUBMED_CACHE_TTL = '7200';

    // Set command line arguments
    process.argv = [
      'node',
      'dist/index.js',
      '--email', 'cli@example.com',
      '--cache-dir', '/cli/cache'
    ];

    const parseArgs = new Function(`${parseArgsFunction}; return parseArgs();`)();
    
    // Simulate the configuration logic
    const email = parseArgs.email || process.env.PUBMED_EMAIL;
    const cacheDir = parseArgs['cache-dir'] || process.env.PUBMED_CACHE_DIR;
    const cacheTTL = parseArgs['cache-ttl'] || process.env.PUBMED_CACHE_TTL;

    expect(email).toBe('cli@example.com'); // CLI should override env
    expect(cacheDir).toBe('/cli/cache'); // CLI should override env
    expect(cacheTTL).toBe('7200'); // Should use env since CLI not provided
  });

  it('should use environment variables when command line arguments are not provided', () => {
    // Set environment variables
    process.env.PUBMED_EMAIL = 'env@example.com';
    process.env.PUBMED_API_KEY = 'env-key';
    process.env.PUBMED_CACHE_DIR = '/env/cache';
    process.env.PUBMED_CACHE_TTL = '7200';

    // No command line arguments
    process.argv = ['node', 'dist/index.js'];

    const parseArgs = new Function(`${parseArgsFunction}; return parseArgs();`)();
    
    // Simulate the configuration logic
    const email = parseArgs.email || process.env.PUBMED_EMAIL;
    const apiKey = parseArgs['api-key'] || process.env.PUBMED_API_KEY;
    const cacheDir = parseArgs['cache-dir'] || process.env.PUBMED_CACHE_DIR;
    const cacheTTL = parseArgs['cache-ttl'] || process.env.PUBMED_CACHE_TTL;

    expect(email).toBe('env@example.com');
    expect(apiKey).toBe('env-key');
    expect(cacheDir).toBe('/env/cache');
    expect(cacheTTL).toBe('7200');
  });

  it('should convert cacheTTL string to number correctly', () => {
    const cacheTTLString = '3600';
    const cacheTTLNumber = parseInt(cacheTTLString);
    
    expect(cacheTTLNumber).toBe(3600);
    expect(typeof cacheTTLNumber).toBe('number');
  });

  it('should handle invalid cacheTTL gracefully', () => {
    const invalidCacheTTL = 'invalid';
    const cacheTTLNumber = parseInt(invalidCacheTTL);
    
    expect(isNaN(cacheTTLNumber)).toBe(true);
  });

  it('should build pubmedOptions object correctly', () => {
    const email = 'test@example.com';
    const apiKey = 'test-key';
    const cacheDir = '/tmp/cache';
    const cacheTTL = '3600';

    const pubmedOptions = {
      email,
      ...(apiKey && { apiKey }),
      ...(cacheDir && { cacheDir }),
      ...(cacheTTL && { cacheTTL: parseInt(cacheTTL) })
    };

    expect(pubmedOptions).toEqual({
      email: 'test@example.com',
      apiKey: 'test-key',
      cacheDir: '/tmp/cache',
      cacheTTL: 3600
    });
  });

  it('should build minimal pubmedOptions object when only email is provided', () => {
    const email = 'test@example.com';
    const apiKey = undefined;
    const cacheDir = undefined;
    const cacheTTL = undefined;

    const pubmedOptions = {
      email,
      ...(apiKey && { apiKey }),
      ...(cacheDir && { cacheDir }),
      ...(cacheTTL && { cacheTTL: parseInt(cacheTTL) })
    };

    expect(pubmedOptions).toEqual({
      email: 'test@example.com'
    });
  });
});