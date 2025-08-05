import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createFetchSummaryHandler } from '../handlers/fetch-summary.js';
import { createPubMedAPI } from '../pubmed-api.js';

// Mock the PubMed API
vi.mock('../pubmed-api.js', () => ({
  createPubMedAPI: vi.fn(),
}));

describe('Fetch Summary Handler', () => {
  const mockPubMedOptions = {
    email: 'test@example.com',
    apiKey: 'test-api-key',
  };

  const mockPubMedAPI = {
    fetchArticles: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (createPubMedAPI as any).mockReturnValue(mockPubMedAPI);
  });

  it('should create fetch summary handler with provided options', () => {
    const handler = createFetchSummaryHandler(mockPubMedOptions);
    
    expect(createPubMedAPI).toHaveBeenCalledWith(mockPubMedOptions);
    expect(handler).toBeDefined();
    expect(typeof handler.fetchSummary).toBe('function');
  });

  it('should fetch articles for single PMID', async () => {
    const mockArticles = [
      {
        pmid: '12345',
        title: 'Test Article',
        authors: ['Author 1', 'Author 2'],
        abstract: 'Test abstract',
        journal: 'Test Journal',
        pubDate: '2023-01-01',
        doi: '10.1234/test',
        pmcId: 'PMC12345',
      },
    ];

    mockPubMedAPI.fetchArticles.mockResolvedValue(mockArticles);

    const handler = createFetchSummaryHandler(mockPubMedOptions);
    const result = await handler.fetchSummary(['12345']);

    expect(mockPubMedAPI.fetchArticles).toHaveBeenCalledWith(['12345']);
    expect(result).toEqual(mockArticles);
  });

  it('should fetch articles for multiple PMIDs', async () => {
    const mockArticles = [
      {
        pmid: '12345',
        title: 'Test Article 1',
        authors: ['Author 1', 'Author 2'],
        abstract: 'Test abstract 1',
        journal: 'Test Journal 1',
        pubDate: '2023-01-01',
        doi: '10.1234/test1',
        pmcId: 'PMC12345',
      },
      {
        pmid: '67890',
        title: 'Test Article 2',
        authors: ['Author 3', 'Author 4'],
        abstract: 'Test abstract 2',
        journal: 'Test Journal 2',
        pubDate: '2023-02-01',
        doi: '10.1234/test2',
        pmcId: 'PMC67890',
      },
    ];

    mockPubMedAPI.fetchArticles.mockResolvedValue(mockArticles);

    const handler = createFetchSummaryHandler(mockPubMedOptions);
    const result = await handler.fetchSummary(['12345', '67890']);

    expect(mockPubMedAPI.fetchArticles).toHaveBeenCalledWith(['12345', '67890']);
    expect(result).toEqual(mockArticles);
    expect(result).toHaveLength(2);
  });

  it('should handle empty PMID array', async () => {
    mockPubMedAPI.fetchArticles.mockResolvedValue([]);

    const handler = createFetchSummaryHandler(mockPubMedOptions);
    const result = await handler.fetchSummary([]);

    expect(mockPubMedAPI.fetchArticles).toHaveBeenCalledWith([]);
    expect(result).toEqual([]);
  });

  it('should work with minimal options (no API key)', () => {
    const minimalOptions = {
      email: 'test@example.com',
    };

    const handler = createFetchSummaryHandler(minimalOptions);
    
    expect(createPubMedAPI).toHaveBeenCalledWith(minimalOptions);
    expect(handler).toBeDefined();
  });

  it('should propagate errors from pubmed API', async () => {
    const errorMessage = 'PubMed API error';
    mockPubMedAPI.fetchArticles.mockRejectedValue(new Error(errorMessage));

    const handler = createFetchSummaryHandler(mockPubMedOptions);

    await expect(handler.fetchSummary(['invalid-pmid'])).rejects.toThrow(errorMessage);
  });

  it('should handle partial results when some PMIDs are invalid', async () => {
    const mockArticles = [
      {
        pmid: '12345',
        title: 'Valid Article',
        authors: ['Author 1'],
        abstract: 'Valid abstract',
        journal: 'Valid Journal',
        pubDate: '2023-01-01',
        doi: '10.1234/valid',
        pmcId: 'PMC12345',
      },
    ];

    // API returns only valid articles, ignoring invalid PMIDs
    mockPubMedAPI.fetchArticles.mockResolvedValue(mockArticles);

    const handler = createFetchSummaryHandler(mockPubMedOptions);
    const result = await handler.fetchSummary(['12345', 'invalid-pmid']);

    expect(mockPubMedAPI.fetchArticles).toHaveBeenCalledWith(['12345', 'invalid-pmid']);
    expect(result).toEqual(mockArticles);
    expect(result).toHaveLength(1);
  });

  it('should handle articles with optional fields missing', async () => {
    const mockArticles = [
      {
        pmid: '12345',
        title: 'Minimal Article',
        authors: [],
        journal: 'Test Journal',
        pubDate: '2023-01-01',
        // abstract, doi, pmcId are optional and missing
      },
    ];

    mockPubMedAPI.fetchArticles.mockResolvedValue(mockArticles);

    const handler = createFetchSummaryHandler(mockPubMedOptions);
    const result = await handler.fetchSummary(['12345']);

    expect(result).toEqual(mockArticles);
    expect(result[0].abstract).toBeUndefined();
    expect(result[0].doi).toBeUndefined();
    expect(result[0].pmcId).toBeUndefined();
  });
});