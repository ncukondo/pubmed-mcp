import { describe, it, expect, beforeAll } from 'vitest';
import { createPubMedAPI, type PubMedAPI } from '../pubmed-api.js';
import { createFetchSummaryHandler } from '../handlers/fetch-summary.js';
import { createGetFullTextHandler } from '../handlers/get-fulltext.js';

/**
 * Snapshot integration tests for summary and fulltext
 * 
 * These tests verify that the API responses remain consistent
 * by comparing against stored snapshots.
 * 
 * Note: PMC article content may change rarely (e.g., corrections),
 * so if a snapshot fails, verify if the change is expected before updating.
 */
describe.sequential('Summary and FullText Snapshot Integration Tests', () => {
  let api: PubMedAPI;
  let summaryHandler: ReturnType<typeof createFetchSummaryHandler>;
  let fullTextHandler: ReturnType<typeof createGetFullTextHandler>;

  // Known stable PMIDs for snapshot testing
  // These articles are unlikely to change and have known PMC IDs
  const STABLE_PMID_WITH_PMC = '39090703'; // Has PMC ID 11293181
  const STABLE_PMID_COVID = '34686906'; // COVID-19 related article

  beforeAll(() => {
    const options = {
      email: 'integration-test@example.com'
    };
    
    api = createPubMedAPI(options);
    summaryHandler = createFetchSummaryHandler(options);
    fullTextHandler = createGetFullTextHandler(options);
  });

  describe('Summary Snapshots', () => {
    it('should match summary snapshot for a known article', async () => {
      const articles = await summaryHandler.fetchSummary([STABLE_PMID_WITH_PMC]);
      
      expect(articles).toBeDefined();
      expect(articles.length).toBe(1);
      
      const article = articles[0];
      
      // Snapshot the stable fields (excluding dynamic ones like cacheFilePath)
      const snapshotData = {
        pmid: article.pmid,
        title: article.title,
        authors: article.authors,
        abstract: article.abstract,
        journal: article.journal,
        pubDate: article.pubDate,
        doi: article.doi,
        pmcId: article.pmcId
      };
      
      expect(snapshotData).toMatchSnapshot('article-summary-39090703');
    }, 15000);

    it('should match summary snapshot for COVID article', async () => {
      const articles = await summaryHandler.fetchSummary([STABLE_PMID_COVID]);
      
      expect(articles).toBeDefined();
      expect(articles.length).toBe(1);
      
      const article = articles[0];
      
      const snapshotData = {
        pmid: article.pmid,
        title: article.title,
        authors: article.authors,
        abstract: article.abstract,
        journal: article.journal,
        pubDate: article.pubDate,
        doi: article.doi,
        pmcId: article.pmcId
      };
      
      expect(snapshotData).toMatchSnapshot('article-summary-34686906');
    }, 15000);

    it('should match summary snapshot for multiple articles', async () => {
      const pmids = [STABLE_PMID_WITH_PMC, STABLE_PMID_COVID];
      const articles = await summaryHandler.fetchSummary(pmids);
      
      expect(articles).toBeDefined();
      expect(articles.length).toBe(2);
      
      const snapshotData = articles.map(article => ({
        pmid: article.pmid,
        title: article.title,
        authors: article.authors,
        abstract: article.abstract,
        journal: article.journal,
        pubDate: article.pubDate,
        doi: article.doi,
        pmcId: article.pmcId
      }));
      
      expect(snapshotData).toMatchSnapshot('multiple-article-summaries');
    }, 20000);
  });

  describe('FullText Snapshots', () => {
    it('should match fulltext snapshot for a known PMC article', async () => {
      const results = await fullTextHandler.getFullText([STABLE_PMID_WITH_PMC]);
      
      expect(results).toBeDefined();
      expect(results.length).toBe(1);
      
      const result = results[0];
      expect(result.pmid).toBe(STABLE_PMID_WITH_PMC);
      expect(result.fullText).not.toBeNull();
      
      // Snapshot the full text content
      const snapshotData = {
        pmid: result.pmid,
        fullText: result.fullText
      };
      
      expect(snapshotData).toMatchSnapshot('fulltext-39090703');
    }, 30000);

    it('should match fulltext structure snapshot', async () => {
      const results = await fullTextHandler.getFullText([STABLE_PMID_WITH_PMC]);
      const fullText = results[0].fullText;
      
      expect(fullText).not.toBeNull();
      
      if (fullText) {
        // Extract structure information for snapshot
        const lines = fullText.split('\n');
        const headers = lines.filter(line => line.match(/^#+\s/));
        const wordCount = fullText.split(/\s+/).length;
        const paragraphCount = fullText.split(/\n\n+/).length;
        
        const structureSnapshot = {
          totalLength: fullText.length,
          wordCount,
          paragraphCount,
          headers,
          hasTitle: fullText.match(/^#\s/) !== null,
          hasAbstract: fullText.includes('## Abstract'),
          hasContent: fullText.includes('## Content')
        };
        
        expect(structureSnapshot).toMatchSnapshot('fulltext-structure-39090703');
      }
    }, 30000);
  });

  describe('Combined Summary and FullText Snapshots', () => {
    it('should match combined data snapshot', async () => {
      const pmid = STABLE_PMID_WITH_PMC;
      
      // Fetch both summary and fulltext
      const [articles, fullTextResults] = await Promise.all([
        summaryHandler.fetchSummary([pmid]),
        fullTextHandler.getFullText([pmid])
      ]);
      
      expect(articles.length).toBe(1);
      expect(fullTextResults.length).toBe(1);
      
      const article = articles[0];
      const fullTextResult = fullTextResults[0];
      
      const combinedSnapshot = {
        summary: {
          pmid: article.pmid,
          title: article.title,
          authors: article.authors,
          journal: article.journal,
          pubDate: article.pubDate,
          doi: article.doi,
          pmcId: article.pmcId,
          hasAbstract: !!article.abstract,
          abstractLength: article.abstract?.length ?? 0
        },
        fullText: {
          pmid: fullTextResult.pmid,
          hasFullText: fullTextResult.fullText !== null,
          fullTextLength: fullTextResult.fullText?.length ?? 0
        }
      };
      
      expect(combinedSnapshot).toMatchSnapshot('combined-summary-fulltext-39090703');
    }, 40000);
  });

  describe('FullText Content Verification Snapshots', () => {
    it('should snapshot first 2000 characters of fulltext', async () => {
      const results = await fullTextHandler.getFullText([STABLE_PMID_WITH_PMC]);
      const fullText = results[0].fullText;
      
      expect(fullText).not.toBeNull();
      
      if (fullText) {
        // Snapshot the beginning of the content (more stable than full content)
        const beginning = fullText.substring(0, 2000);
        expect(beginning).toMatchSnapshot('fulltext-beginning-39090703');
      }
    }, 30000);

    it('should snapshot abstract section of fulltext', async () => {
      const results = await fullTextHandler.getFullText([STABLE_PMID_WITH_PMC]);
      const fullText = results[0].fullText;
      
      expect(fullText).not.toBeNull();
      
      if (fullText) {
        // Extract abstract section
        const abstractMatch = fullText.match(/## Abstract\n([\s\S]*?)(?=\n## |$)/);
        const abstract = abstractMatch ? abstractMatch[1].trim() : null;
        
        expect(abstract).not.toBeNull();
        expect(abstract).toMatchSnapshot('fulltext-abstract-section-39090703');
      }
    }, 30000);
  });
});
