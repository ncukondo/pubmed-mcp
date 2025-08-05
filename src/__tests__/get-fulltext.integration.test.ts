import { describe, it, expect, beforeAll } from 'vitest';
import { createGetFullTextHandler } from '../handlers/get-fulltext.js';

describe('Get Full Text Handler Integration Tests', () => {
  let handler: ReturnType<typeof createGetFullTextHandler>;

  beforeAll(() => {
    handler = createGetFullTextHandler({
      email: 'integration-test@example.com'
    });
  });

  describe('Real API Integration', () => {
    it('should get full text for a known PMC article', async () => {
      // Use PMID 39090703 which has known PMC ID 11293181
      const pmid = '39090703';
      
      const results = await handler.getFullText([pmid]);
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(1);

      const result = results[0];
      expect(result.pmid).toBe(pmid);
      expect(result.fullText).not.toBeNull();
      expect(typeof result.fullText).toBe('string');
      expect(result.fullText!.length).toBeGreaterThan(1000);
      
      // Should contain structured markdown content
      expect(result.fullText).toMatch(/^#\s/m); // Title as H1
      expect(result.fullText).toMatch(/^## Abstract/m); // Abstract as H2
      expect(result.fullText).toMatch(/^## Content/m); // Content as H2
    }, 20000);

    it('should handle multiple PMIDs with mixed availability', async () => {
      const pmids = [
        '39090703', // Known to have full text
        '12345678', // Likely doesn't exist or no full text
        '34686906'  // Another potential full text article
      ];
      
      const results = await handler.getFullText(pmids);
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(3);
      
      // Results should maintain order of input PMIDs
      expect(results[0].pmid).toBe('39090703');
      expect(results[1].pmid).toBe('12345678');
      expect(results[2].pmid).toBe('34686906');
      
      // At least one should have full text
      const hasFullText = results.some(result => result.fullText !== null);
      expect(hasFullText).toBe(true);
    }, 25000);

    it('should handle empty PMID array', async () => {
      const results = await handler.getFullText([]);
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    }, 5000);

    it('should handle single PMID with no full text', async () => {
      // Use a PMID that likely doesn't have PMC full text
      const pmid = '99999999'; // Non-existent PMID
      
      const results = await handler.getFullText([pmid]);
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(1);
      
      const result = results[0];
      expect(result.pmid).toBe(pmid);
      expect(result.fullText).toBeNull();
    }, 10000);

    it('should properly format full text content', async () => {
      const pmid = '39090703';
      
      const results = await handler.getFullText([pmid]);
      const fullText = results[0].fullText;
      
      if (fullText) {
        // Should be properly formatted markdown
        expect(fullText).toMatch(/^# .+$/m); // Title line
        expect(fullText).toMatch(/^## Abstract$/m); // Abstract header
        expect(fullText).toMatch(/^## Content$/m); // Content header
        
        // Should not have excessive whitespace
        expect(fullText).not.toMatch(/\n\n\n+/); // No triple+ newlines
        expect(fullText).not.toMatch(/[ \t]{2,}/); // No multiple spaces/tabs
        
        // Should contain expected content keywords
        expect(fullText).toMatch(/\w+/); // Contains actual words
      }
    }, 15000);

    it('should handle batch processing efficiently', async () => {
      const pmids = ['39090703', '34686906'];
      const startTime = Date.now();
      
      const results = await handler.getFullText(pmids);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(results.length).toBe(2);
      
      // Should complete within reasonable time (less than 30 seconds for 2 articles)
      expect(duration).toBeLessThan(30000);
      
      // Verify both results are present
      expect(results[0].pmid).toBe('39090703');
      expect(results[1].pmid).toBe('34686906');
    }, 35000);
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      // This test documents expected behavior during API failures
      try {
        const results = await handler.getFullText(['invalid-format-pmid']);
        expect(Array.isArray(results)).toBe(true);
      } catch (error) {
        // API errors should be propagated
        expect(error).toBeInstanceOf(Error);
      }
    }, 10000);

    it('should handle network issues gracefully', async () => {
      // This test might be flaky but documents expected behavior
      try {
        const results = await handler.getFullText(['12345']);
        expect(Array.isArray(results)).toBe(true);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    }, 15000);
  });

  describe('Content Quality', () => {
    it('should extract meaningful content from available articles', async () => {
      const pmid = '39090703';
      
      const results = await handler.getFullText([pmid]);
      const fullText = results[0].fullText;
      
      if (fullText) {
        // Should contain substantial content (not just title/abstract)
        expect(fullText.length).toBeGreaterThan(5000);
        
        // Should contain specific content from this article
        expect(fullText.toLowerCase()).toMatch(/teaching|learn|resident/);
        
        // Should have proper structure
        const sections = fullText.split(/^##\s+/m).filter(s => s.trim());
        expect(sections.length).toBeGreaterThanOrEqual(2); // At least Abstract and Content
      }
    }, 15000);

    it('should clean up text formatting properly', async () => {
      const pmid = '39090703';
      
      const results = await handler.getFullText([pmid]);
      const fullText = results[0].fullText;
      
      if (fullText) {
        // Should not have XML/HTML artifacts
        expect(fullText).not.toMatch(/<[^>]+>/); // No HTML tags
        expect(fullText).not.toMatch(/&\w+;/); // No HTML entities
        
        // Should have consistent spacing
        expect(fullText).not.toMatch(/\s{3,}/); // No excessive whitespace
        
        // Should end cleanly (no trailing whitespace)
        expect(fullText.endsWith(' ')).toBe(false);
        expect(fullText.endsWith('\n')).toBe(false);
      }
    }, 15000);
  });
});