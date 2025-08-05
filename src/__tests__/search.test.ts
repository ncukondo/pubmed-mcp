import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSearchHandler } from '../handlers/search.js';
import { createPubMedAPI } from '../pubmed-api.js';

// Mock the PubMed API
vi.mock('../pubmed-api.js', () => ({
  createPubMedAPI: vi.fn(),
}));

describe('Search Handler', () => {
  const mockPubMedOptions = {
    email: 'test@example.com',
    apiKey: 'test-api-key',
  };

  const mockPubMedAPI = {
    searchAndFetch: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (createPubMedAPI as any).mockReturnValue(mockPubMedAPI);
  });

  it('should create search handler with provided options', () => {
    const handler = createSearchHandler(mockPubMedOptions);
    
    expect(createPubMedAPI).toHaveBeenCalledWith(mockPubMedOptions);
    expect(handler).toBeDefined();
    expect(typeof handler.search).toBe('function');
  });

  it('should call pubmed API with correct parameters', async () => {
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

    mockPubMedAPI.searchAndFetch.mockResolvedValue(mockArticles);

    const handler = createSearchHandler(mockPubMedOptions);
    const result = await handler.search('covid-19');

    expect(mockPubMedAPI.searchAndFetch).toHaveBeenCalledWith('covid-19', undefined);
    expect(result).toEqual([
      {
        pmid: '12345',
        title: 'Test Article',
        pubDate: '2023-01-01',
      },
    ]);
  });

  it('should pass search options to pubmed API', async () => {
    const mockArticles = [
      {
        pmid: '67890',
        title: 'Another Test Article',
        authors: ['Author 3'],
        abstract: 'Another test abstract',
        journal: 'Another Test Journal',
        pubDate: '2023-02-01',
        doi: '10.1234/test2',
        pmcId: 'PMC67890',
      },
    ];

    mockPubMedAPI.searchAndFetch.mockResolvedValue(mockArticles);

    const searchOptions = {
      retMax: 10,
      sort: 'pub_date' as const,
      dateFrom: '2023/01/01',
      dateTo: '2023/12/31',
    };

    const handler = createSearchHandler(mockPubMedOptions);
    const result = await handler.search('machine learning', searchOptions);

    expect(mockPubMedAPI.searchAndFetch).toHaveBeenCalledWith('machine learning', searchOptions);
    expect(result).toEqual([
      {
        pmid: '67890',
        title: 'Another Test Article',
        pubDate: '2023-02-01',
      },
    ]);
  });

  it('should work with minimal options (no API key)', () => {
    const minimalOptions = {
      email: 'test@example.com',
    };

    const handler = createSearchHandler(minimalOptions);
    
    expect(createPubMedAPI).toHaveBeenCalledWith(minimalOptions);
    expect(handler).toBeDefined();
  });

  it('should propagate errors from pubmed API', async () => {
    const errorMessage = 'PubMed API error';
    mockPubMedAPI.searchAndFetch.mockRejectedValue(new Error(errorMessage));

    const handler = createSearchHandler(mockPubMedOptions);

    await expect(handler.search('invalid query')).rejects.toThrow(errorMessage);
  });
});