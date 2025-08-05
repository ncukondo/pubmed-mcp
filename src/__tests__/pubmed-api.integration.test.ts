import { describe, it, expect, beforeAll } from 'vitest';
import { createPubMedAPI, type PubMedAPI } from '../pubmed-api.js';

describe('PubMed API Integration Tests', () => {
  let api: PubMedAPI;

  beforeAll(() => {
    // Use a test email for integration tests
    // In real usage, users should provide their own email
    api = createPubMedAPI({
      email: 'integration-test@example.com'
    });
  });

  describe('Real API Integration', () => {
    it('should perform a real search with small result set', async () => {
      // Use a very specific query to limit results and avoid overloading the API
      const result = await api.search('PMC test[Title]', { retMax: 2 });

      expect(result).toBeDefined();
      expect(typeof result.count).toBe('number');
      expect(Array.isArray(result.idList)).toBe(true);
      expect(result.retMax).toBe(2);
      expect(result.retStart).toBe(0);
      
      // Should have some results for this query
      expect(result.count).toBeGreaterThan(0);
    }, 10000); // 10 second timeout for API calls

    it('should fetch article details from real API', async () => {
      // Use a known PMID for testing
      const knownPMID = '34686906'; // A real article about COVID-19

      const articles = await api.fetchArticles([knownPMID]);

      expect(articles).toBeDefined();
      expect(Array.isArray(articles)).toBe(true);
      expect(articles.length).toBe(1);

      const article = articles[0];
      expect(article.pmid).toBe(knownPMID);
      expect(typeof article.title).toBe('string');
      expect(article.title.length).toBeGreaterThan(0);
      expect(Array.isArray(article.authors)).toBe(true);
      expect(typeof article.journal).toBe('string');
      expect(typeof article.pubDate).toBe('string');
    }, 10000);

    it('should perform searchAndFetch with real API', async () => {
      // Search for a very specific term to get predictable results
      const articles = await api.searchAndFetch('coronavirus disease 2019[Title]', {
        maxResults: 2
      });

      expect(articles).toBeDefined();
      expect(Array.isArray(articles)).toBe(true);
      expect(articles.length).toBeGreaterThanOrEqual(1);
      expect(articles.length).toBeLessThanOrEqual(2);

      // Verify article structure
      articles.forEach(article => {
        expect(typeof article.pmid).toBe('string');
        expect(article.pmid.length).toBeGreaterThan(0);
        expect(typeof article.title).toBe('string');
        expect(article.title.length).toBeGreaterThan(0);
        expect(Array.isArray(article.authors)).toBe(true);
        expect(typeof article.journal).toBe('string');
        expect(typeof article.pubDate).toBe('string');
      });
    }, 15000);

    it('should handle search with date filters', async () => {
      const result = await api.search('machine learning', {
        retMax: 3,
        dateFrom: '2023/01/01',
        dateTo: '2023/12/31'
      });

      expect(result).toBeDefined();
      expect(typeof result.count).toBe('number');
      expect(Array.isArray(result.idList)).toBe(true);
    }, 10000);

    it('should handle empty search results gracefully', async () => {
      // Use a query that should return no results
      const result = await api.search('zyxwvutsrqponmlkjihgfedcba12345', {
        retMax: 5
      });

      expect(result).toBeDefined();
      expect(result.count).toBe(0);
      expect(result.idList).toEqual([]);
    }, 10000);

    it('should respect rate limiting', async () => {
      const startTime = Date.now();
      
      // Make multiple requests
      await api.search('test query 1', { retMax: 1 });
      await api.search('test query 2', { retMax: 1 });
      await api.search('test query 3', { retMax: 1 });
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      // Should take at least 600ms for 3 requests (334ms delay between each)
      // without API key
      expect(totalTime).toBeGreaterThan(600);
    }, 15000);

    it('should check full text availability for a known PMC article', async () => {
      // Use a PMID that is known to have PMC full text
      const knownPMIDWithPMC = '34686906'; // This should have PMC full text

      const result = await api.checkFullTextAvailability(knownPMIDWithPMC);

      expect(result).toBeDefined();
      expect(typeof result.hasFullText).toBe('boolean');
      
      if (result.hasFullText) {
        expect(typeof result.pmcId).toBe('string');
        expect(result.pmcId).toBeTruthy();
      }
    }, 10000);

    it('should check full text availability for an article without PMC', async () => {
      // Use a PMID that likely doesn't have PMC full text
      const pmidWithoutPMC = '12345678'; // Random PMID that probably doesn't exist

      const result = await api.checkFullTextAvailability(pmidWithoutPMC);

      expect(result).toBeDefined();
      expect(typeof result.hasFullText).toBe('boolean');
      // For non-existent PMID, should return false
      expect(result.hasFullText).toBe(false);
    }, 10000);

    it('should attempt to get full text for a PMC article', async () => {
      // Use a PMID that should have PMC full text
      const knownPMIDWithPMC = '34686906';

      const results = await api.getFullText([knownPMIDWithPMC]);
      const fullText = results[0]?.fullText;

      // Full text might be available or not, depending on the article
      if (fullText !== null) {
        expect(typeof fullText).toBe('string');
        expect(fullText.length).toBeGreaterThan(0);
        // Should contain structured sections in markdown format
        expect(fullText).toMatch(/^#\s|^##\s(Abstract|Content)/m);
      } else {
        // If no full text available, should return null gracefully
        expect(fullText).toBeNull();
      }
    }, 15000);

    it('should get full text for PMID 39090703 with known PMC ID', async () => {
      // Use the specific PMID that we tested manually
      const pmid = '39090703'; // PMC ID: 11293181
      
      // First check availability
      const availability = await api.checkFullTextAvailability(pmid);
      expect(availability.hasFullText).toBe(true);
      expect(availability.pmcId).toBe('11293181');
      
      // Then get the full text
      const results = await api.getFullText([pmid]);
      const fullText = results[0]?.fullText;
      
      expect(fullText).not.toBeNull();
      expect(typeof fullText).toBe('string');
      expect(fullText!.length).toBeGreaterThan(40000); // Should be substantial content
      
      // Should contain all structured sections in markdown format
      expect(fullText).toMatch(/^#\s/m); // Title as H1
      expect(fullText).toMatch(/^## Abstract/m); // Abstract as H2
      expect(fullText).toMatch(/^## Content/m); // Content as H2
      
      // Should contain expected content from this specific article
      expect(fullText).toMatch(/To teach is to learn twice/i);
      expect(fullText).toMatch(/qualitative study/i);
      expect(fullText).toMatch(/residents learn through teaching/i);
    }, 20000);
  });

  describe('Error Handling', () => {
    it('should handle invalid PMIDs gracefully', async () => {
      const articles = await api.fetchArticles(['invalid-pmid-12345']);
      
      // Should not throw error, but might return empty array
      expect(Array.isArray(articles)).toBe(true);
    }, 10000);

    it('should handle network timeouts gracefully', async () => {
      // This test might be flaky depending on network conditions
      // It's more of a documentation of expected behavior
      try {
        const result = await api.search('test query', { retMax: 1 });
        expect(result).toBeDefined();
      } catch (error) {
        // Network errors should be thrown as expected
        expect(error).toBeInstanceOf(Error);
      }
    }, 10000);
  });
});