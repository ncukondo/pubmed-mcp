import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createPubMedAPI } from '../pubmed-api.js';
import { promises as fs } from 'fs';
import { join } from 'path';

describe.sequential('PMID 40468340 Abstract Verification', () => {
  const testCacheDir = join(process.cwd(), 'test-pmid-40468340-cache');
  let api: ReturnType<typeof createPubMedAPI>;

  beforeEach(async () => {
    // Clean up any existing test cache
    await fs.rm(testCacheDir, { recursive: true, force: true }).catch(() => {});
    
    // Create API instance with cache enabled
    api = createPubMedAPI({
      email: 'test@example.com',
      cacheDir: testCacheDir,
      cacheTTL: 3600 // 1 hour
    });
  });

  afterEach(async () => {
    // Clean up test cache directory
    await fs.rm(testCacheDir, { recursive: true, force: true }).catch(() => {});
  });

  it('should correctly fetch and cache abstract for PMID 40468340 without [Object] artifacts', async () => {
    console.log('Fetching PMID: 40468340...');
    
    // Fetch the article
    const articles = await api.fetchArticles(['40468340']);
    
    expect(articles).toHaveLength(1);
    const article = articles[0];
    
    expect(article.pmid).toBe('40468340');
    expect(article.title).toBeDefined();
    expect(article.abstract).toBeDefined();
    
    console.log('Article Title:', article.title);
    console.log('Abstract length:', article.abstract?.length || 0);
    console.log('Abstract preview:', article.abstract?.substring(0, 200) + '...');
    
    // Verify abstract doesn't contain [Object] artifacts
    expect(article.abstract).not.toContain('[Object]');
    expect(article.abstract).not.toContain('[object Object]');
    
    // Verify cache file was created
    const cacheFile = join(testCacheDir, 'summary', '40468340.json');
    const cacheExists = await fs.access(cacheFile).then(() => true).catch(() => false);
    expect(cacheExists).toBe(true);
    
    // Check cache file content
    const cacheContent = await fs.readFile(cacheFile, 'utf8');
    const cacheData = JSON.parse(cacheContent);
    
    console.log('Cached abstract length:', cacheData.data.abstract?.length || 0);
    console.log('Cached abstract preview:', cacheData.data.abstract?.substring(0, 200) + '...');
    
    // Verify cached abstract doesn't contain [Object] artifacts
    expect(cacheData.data.abstract).not.toContain('[Object]');
    expect(cacheData.data.abstract).not.toContain('[object Object]');
    
    // Verify cached data matches fetched data
    expect(cacheData.data.pmid).toBe(article.pmid);
    expect(cacheData.data.title).toBe(article.title);
    expect(cacheData.data.abstract).toBe(article.abstract);
    
    // Print the full cached JSON for verification
    console.log('\n--- Full Cache file content ---');
    console.log(cacheContent);
    
    console.log('✅ Abstract correctly cached without [Object] artifacts');
  }, 30000); // 30 second timeout for API call

  it('should retrieve the same abstract from cache on subsequent calls', async () => {
    // First call - fetch from API
    const articles1 = await api.fetchArticles(['40468340']);
    const firstAbstract = articles1[0].abstract;
    
    // Second call - should use cache
    const articles2 = await api.fetchArticles(['40468340']);
    const cachedAbstract = articles2[0].abstract;
    
    // They should be identical
    expect(cachedAbstract).toBe(firstAbstract);
    expect(cachedAbstract).not.toContain('[Object]');
    
    console.log('✅ Cached abstract matches original and contains no [Object] artifacts');
  }, 30000);
});