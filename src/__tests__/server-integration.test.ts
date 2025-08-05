import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';

describe('Server Integration with Cache Configuration', () => {
  const testCacheDir = join(process.cwd(), 'test-server-cache');
  let serverProcess: ChildProcess | null = null;

  beforeEach(async () => {
    // Clean up any existing test cache
    await fs.rm(testCacheDir, { recursive: true, force: true }).catch(() => {});
  });

  afterEach(async () => {
    // Kill server process if running
    if (serverProcess) {
      serverProcess.kill();
      serverProcess = null;
    }
    
    // Clean up test cache directory
    await fs.rm(testCacheDir, { recursive: true, force: true }).catch(() => {});
  });

  it('should display cache configuration when starting server', async () => {
    const email = 'test@example.com';
    const cacheTTL = '3600';

    let stderr = '';
    let resolved = false;

    return new Promise<void>((resolve, reject) => {
      // Start server process with cache configuration
      serverProcess = spawn('node', [
        'dist/index.js',
        '--email', email,
        '--cache-dir', testCacheDir,
        '--cache-ttl', cacheTTL
      ], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
      });

      let stdout = '';
      
      serverProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
        
        // Check if we've received the expected configuration output
        if (!resolved && stdout.includes('MCP PubMed Server') &&
            stdout.includes(`Email: ${email}`) &&
            stdout.includes(`Cache Directory: ${testCacheDir}`) &&
            stdout.includes(`Cache TTL: ${cacheTTL} seconds`)) {
          
          resolved = true;
          
          try {
            expect(stdout).toContain('MCP PubMed Server');
            expect(stdout).toContain(`Email: ${email}`);
            expect(stdout).toContain(`API Key: Not configured`);
            expect(stdout).toContain(`Cache Directory: ${testCacheDir}`);
            expect(stdout).toContain(`Cache TTL: ${cacheTTL} seconds`);
            resolve();
          } catch (error) {
            reject(error);
          }
        }
      });

      serverProcess.on('error', (error) => {
        if (!resolved) {
          reject(new Error(`Server process error: ${error.message}`));
        }
      });

      serverProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      serverProcess.on('exit', (code, signal) => {
        if (!resolved && code !== 0) {
          reject(new Error(`Server exited with code ${code}, signal ${signal}. stderr: ${stderr}`));
        }
      });

      // Timeout after 3 seconds - should be enough to see config output
      setTimeout(() => {
        if (!resolved) {
          reject(new Error(`Server configuration not displayed within timeout. stdout: ${stdout}, stderr: ${stderr}`));
        }
      }, 3000);
    });
  }, 10000);

  it('should show default values when cache is not configured', async () => {
    const email = 'test@example.com';

    let stderr = '';
    let stdout = '';
    let resolved = false;

    return new Promise<void>((resolve, reject) => {
      serverProcess = spawn('node', [
        'dist/index.js',
        '--email', email
      ], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
      });

      serverProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
        
        if (!resolved && stdout.includes('MCP PubMed Server') &&
            stdout.includes('Cache Directory: Not configured (caching disabled)') &&
            stdout.includes('Cache TTL:')) {
          
          resolved = true;
          
          try {
            expect(stdout).toContain(`Email: ${email}`);
            expect(stdout).toContain('API Key: Not configured');
            expect(stdout).toContain('Cache Directory: Not configured (caching disabled)');
            expect(stdout).toContain('Cache TTL: 86400 seconds (default)');
            resolve();
          } catch (error) {
            reject(error);
          }
        }
      });

      serverProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      serverProcess.on('error', (error) => {
        if (!resolved) {
          reject(new Error(`Server process error: ${error.message}`));
        }
      });

      serverProcess.on('exit', (code, signal) => {
        if (!resolved && code !== 0) {
          reject(new Error(`Server exited with code ${code}, signal ${signal}. stderr: ${stderr}`));
        }
      });

      setTimeout(() => {
        if (!resolved) {
          reject(new Error(`Server configuration not displayed within timeout. stdout: ${stdout}, stderr: ${stderr}`));
        }
      }, 3000);
    });
  }, 10000);

  it('should prioritize environment variables over defaults', async () => {
    const envEmail = 'env@example.com';
    const envCacheDir = join(process.cwd(), 'env-cache');
    const envCacheTTL = '7200';

    let stderr = '';
    let stdout = '';
    let resolved = false;

    return new Promise<void>((resolve, reject) => {
      serverProcess = spawn('node', ['dist/index.js'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PUBMED_EMAIL: envEmail,
          PUBMED_CACHE_DIR: envCacheDir,
          PUBMED_CACHE_TTL: envCacheTTL
        }
      });

      serverProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
        
        if (!resolved && stdout.includes('MCP PubMed Server') &&
            stdout.includes(`Cache Directory: ${envCacheDir}`)) {
          
          resolved = true;
          
          try {
            expect(stdout).toContain(`Email: ${envEmail}`);
            expect(stdout).toContain(`Cache Directory: ${envCacheDir}`);
            expect(stdout).toContain(`Cache TTL: ${envCacheTTL} seconds`);
            resolve();
          } catch (error) {
            reject(error);
          }
        }
      });

      serverProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      serverProcess.on('error', (error) => {
        if (!resolved) {
          reject(new Error(`Server process error: ${error.message}`));
        }
      });

      serverProcess.on('exit', (code, signal) => {
        if (!resolved && code !== 0) {
          reject(new Error(`Server exited with code ${code}, signal ${signal}. stderr: ${stderr}`));
        }
      });

      setTimeout(() => {
        if (!resolved) {
          reject(new Error(`Server configuration not displayed within timeout. stdout: ${stdout}, stderr: ${stderr}`));
        }
      }, 3000);
    });
  }, 10000);

  it('should prioritize command line arguments over environment variables', async () => {
    const envEmail = 'env@example.com';
    const cliEmail = 'cli@example.com';
    const envCacheDir = join(process.cwd(), 'env-cache');
    const cliCacheDir = join(process.cwd(), 'cli-cache');

    let stderr = '';
    let stdout = '';
    let resolved = false;

    return new Promise<void>((resolve, reject) => {
      serverProcess = spawn('node', [
        'dist/index.js',
        '--email', cliEmail,
        '--cache-dir', cliCacheDir
      ], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PUBMED_EMAIL: envEmail,
          PUBMED_CACHE_DIR: envCacheDir,
          PUBMED_CACHE_TTL: '7200'
        }
      });

      serverProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
        
        if (!resolved && stdout.includes('MCP PubMed Server') &&
            stdout.includes(`Cache Directory: ${cliCacheDir}`)) {
          
          resolved = true;
          
          try {
            expect(stdout).toContain(`Email: ${cliEmail}`); // CLI should override env
            expect(stdout).toContain(`Cache Directory: ${cliCacheDir}`); // CLI should override env
            expect(stdout).toContain('Cache TTL: 7200 seconds'); // Should use env since CLI not provided
            resolve();
          } catch (error) {
            reject(error);
          }
        }
      });

      serverProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      serverProcess.on('error', (error) => {
        if (!resolved) {
          reject(new Error(`Server process error: ${error.message}`));
        }
      });

      serverProcess.on('exit', (code, signal) => {
        if (!resolved && code !== 0) {
          reject(new Error(`Server exited with code ${code}, signal ${signal}. stderr: ${stderr}`));
        }
      });

      setTimeout(() => {
        if (!resolved) {
          reject(new Error(`Server configuration not displayed within timeout. stdout: ${stdout}, stderr: ${stderr}`));
        }
      }, 3000);
    });
  }, 10000);
});