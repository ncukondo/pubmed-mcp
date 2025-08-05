import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPubMedAPI } from '../pubmed-api';
import { promises as fs } from 'fs';
import { join } from 'path';

describe('PubMed API Cache', () => {
  const testCacheDir = join(process.cwd(), 'test-cache-vitest');
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

  describe('Cache Directory Creation', () => {
    it('should create cache directories when first writing to cache', async () => {
      // Mock the API response
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(`
          <eSearchResult>
            <IdList><Id>12345</Id></IdList>
            <Count>1</Count>
          </eSearchResult>
        `)
      });

      // Mock fetchArticles response
      const mockFetchResponse = `
        <PubmedArticleSet>
          <PubmedArticle>
            <MedlineCitation>
              <PMID>12345</PMID>
              <Article>
                <ArticleTitle>Test Article</ArticleTitle>
                <Journal><Title>Test Journal</Title></Journal>
                <AuthorList>
                  <Author>
                    <LastName>Test</LastName>
                    <ForeName>Author</ForeName>
                  </Author>
                </AuthorList>
              </Article>
            </MedlineCitation>
            <PubmedData>
              <ArticleIdList></ArticleIdList>
            </PubmedData>
          </PubmedArticle>
        </PubmedArticleSet>
      `;

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(`<eSearchResult><IdList><Id>12345</Id></IdList><Count>1</Count></eSearchResult>`)
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(mockFetchResponse)
        });

      await api.searchAndFetch('test query', { maxResults: 1 });

      // Check that cache directories were created
      const summaryDir = join(testCacheDir, 'summary');
      const fulltextDir = join(testCacheDir, 'fulltext');

      const summaryExists = await fs.access(summaryDir).then(() => true).catch(() => false);
      const fulltextExists = await fs.access(fulltextDir).then(() => true).catch(() => false);


      expect(summaryExists).toBe(true);
      expect(fulltextExists).toBe(true);
    });
  });

  describe('Summary Cache', () => {
    const mockPmid = '12345';
    const mockArticle = {
      pmid: mockPmid,
      title: 'Test Article Title',
      authors: ['Doe, John'],
      abstract: 'Test abstract content',
      journal: 'Test Journal',
      pubDate: '2023',
      doi: '10.1234/test',
      pmcId: undefined
    };

    beforeEach(() => {
      // Mock the fetchArticles API response
      const mockResponse = `
        <PubmedArticleSet>
          <PubmedArticle>
            <MedlineCitation>
              <PMID>${mockPmid}</PMID>
              <Article>
                <ArticleTitle>${mockArticle.title}</ArticleTitle>
                <Journal><Title>${mockArticle.journal}</Title></Journal>
                <AuthorList>
                  <Author>
                    <LastName>Doe</LastName>
                    <ForeName>John</ForeName>
                  </Author>
                </AuthorList>
                <Abstract>
                  <AbstractText>${mockArticle.abstract}</AbstractText>
                </Abstract>
              </Article>
            </MedlineCitation>
            <PubmedData>
              <ArticleIdList>
                <ArticleId IdType="doi">${mockArticle.doi}</ArticleId>
              </ArticleIdList>
            </PubmedData>
          </PubmedArticle>
        </PubmedArticleSet>
      `;

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockResponse)
      });
    });

    it('should cache article summaries and retrieve them on subsequent calls', async () => {
      // First call - should fetch from API and cache
      const result1 = await api.fetchArticles([mockPmid]);
      expect(result1).toHaveLength(1);
      expect(result1[0].pmid).toBe(mockPmid);
      expect(result1[0].title).toBe(mockArticle.title);

      // Verify cache file was created
      const cacheFile = join(testCacheDir, 'summary', `${mockPmid}.json`);
      const cacheExists = await fs.access(cacheFile).then(() => true).catch(() => false);
      expect(cacheExists).toBe(true);

      // Verify cache file content
      const cacheContent = await fs.readFile(cacheFile, 'utf8');
      const cacheData = JSON.parse(cacheContent);
      expect(cacheData.data.pmid).toBe(mockPmid);
      expect(cacheData.data.title).toBe(mockArticle.title);
      expect(typeof cacheData.timestamp).toBe('number');

      // Reset fetch mock to ensure second call doesn't hit API
      (global.fetch as any).mockClear();

      // Second call - should use cache
      const result2 = await api.fetchArticles([mockPmid]);
      expect(result2).toHaveLength(1);
      expect(result2[0].pmid).toBe(mockPmid);
      expect(result2[0].title).toBe(mockArticle.title);

      // Verify no API calls were made
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle cache expiration correctly', async () => {
      // Create API with very short TTL
      const shortTtlApi = createPubMedAPI({
        email: 'test@example.com',
        cacheDir: testCacheDir,
        cacheTTL: 1 // 1 second
      });

      // First call
      await shortTtlApi.fetchArticles([mockPmid]);

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Reset fetch mock
      (global.fetch as any).mockClear();

      // Second call after expiration - should fetch from API again
      await shortTtlApi.fetchArticles([mockPmid]);

      // Verify API was called again
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  describe('Full Text Cache', () => {
    const mockPmid = '12345';
    const mockPmcId = '67890';

    beforeEach(() => {
      // Mock elink response for full text availability
      const mockElinkResponse = `
        <eLinkResult>
          <LinkSet>
            <IdList><Id>${mockPmid}</Id></IdList>
            <LinkSetDb>
              <Link><Id>${mockPmcId}</Id></Link>
            </LinkSetDb>
          </LinkSet>
        </eLinkResult>
      `;

      // Mock PMC full text response
      const mockPmcResponse = `
        <pmc-articleset>
          <article>
            <front>
              <article-meta>
                <title-group>
                  <article-title>Test Article</article-title>
                </title-group>
                <abstract>Test abstract</abstract>
              </article-meta>
            </front>
            <body>Test content</body>
          </article>
        </pmc-articleset>
      `;

      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(mockElinkResponse)
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(mockPmcResponse)
        });
    });

    it('should cache full text and retrieve it on subsequent calls', async () => {
      // First call - should fetch from API and cache
      const result1 = await api.getFullText([mockPmid]);
      expect(result1).toHaveLength(1);
      expect(result1[0].pmid).toBe(mockPmid);
      expect(result1[0].fullText).toContain('Test Article');

      // Verify cache file was created
      const cacheFile = join(testCacheDir, 'fulltext', `${mockPmid}.md`);
      const cacheExists = await fs.access(cacheFile).then(() => true).catch(() => false);
      expect(cacheExists).toBe(true);

      // Verify cache file content
      const cacheContent = await fs.readFile(cacheFile, 'utf8');
      expect(cacheContent).toMatch(/^<!-- timestamp: \d+ -->/);
      expect(cacheContent).toContain('Test Article');

      // Reset fetch mock
      (global.fetch as any).mockClear();

      // Second call - should use cache
      const result2 = await api.getFullText([mockPmid]);
      expect(result2).toHaveLength(1);
      expect(result2[0].pmid).toBe(mockPmid);
      expect(result2[0].fullText).toBe(result1[0].fullText);

      // Verify no API calls were made
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle full text cache expiration correctly', async () => {
      // Create API with very short TTL
      const shortTtlApi = createPubMedAPI({
        email: 'test@example.com',
        cacheDir: testCacheDir,
        cacheTTL: 1 // 1 second
      });

      // First call
      await shortTtlApi.getFullText([mockPmid]);

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Reset fetch mock for second call
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(`
            <eLinkResult>
              <LinkSet>
                <IdList><Id>${mockPmid}</Id></IdList>
                <LinkSetDb>
                  <Link><Id>${mockPmcId}</Id></Link>
                </LinkSetDb>
              </LinkSet>
            </eLinkResult>
          `)
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(`
            <pmc-articleset>
              <article>
                <front>
                  <article-meta>
                    <title-group>
                      <article-title>Test Article</article-title>
                    </title-group>
                  </article-meta>
                </front>
                <body>Test content</body>
              </article>
            </pmc-articleset>
          `)
        });

      // Second call after expiration - should fetch from API again
      await shortTtlApi.getFullText([mockPmid]);

      // Verify API was called again
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  describe('Cache without cacheDir', () => {
    it('should work normally without caching when cacheDir is not provided', async () => {
      const noCacheApi = createPubMedAPI({
        email: 'test@example.com'
        // No cacheDir provided
      });

      const mockResponse = `
        <PubmedArticleSet>
          <PubmedArticle>
            <MedlineCitation>
              <PMID>12345</PMID>
              <Article>
                <ArticleTitle>Test Article</ArticleTitle>
                <Journal><Title>Test Journal</Title></Journal>
              </Article>
            </MedlineCitation>
            <PubmedData>
              <ArticleIdList></ArticleIdList>
            </PubmedData>
          </PubmedArticle>
        </PubmedArticleSet>
      `;

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockResponse)
      });

      const result = await noCacheApi.fetchArticles(['12345']);
      expect(result).toHaveLength(1);
      expect(result[0].pmid).toBe('12345');

      // Verify no cache directories were created
      const cacheExists = await fs.access(testCacheDir).then(() => true).catch(() => false);
      expect(cacheExists).toBe(false);
    });
  });
});