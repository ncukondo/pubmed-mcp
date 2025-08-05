import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createGetFullTextHandler } from '../handlers/get-fulltext.js';
import { createPubMedAPI } from '../pubmed-api.js';

// Mock the PubMed API
vi.mock('../pubmed-api.js', () => ({
  createPubMedAPI: vi.fn(),
}));

describe('Get Full Text Handler', () => {
  const mockPubMedOptions = {
    email: 'test@example.com',
    apiKey: 'test-api-key',
  };

  const mockPubMedAPI = {
    getFullText: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (createPubMedAPI as any).mockReturnValue(mockPubMedAPI);
  });

  it('should create get full text handler with provided options', () => {
    const handler = createGetFullTextHandler(mockPubMedOptions);
    
    expect(createPubMedAPI).toHaveBeenCalledWith(mockPubMedOptions);
    expect(handler).toBeDefined();
    expect(typeof handler.getFullText).toBe('function');
  });

  it('should call pubmed API getFullText with correct parameters', async () => {
    const mockResults = [
      {
        pmid: '12345',
        fullText: '# Test Article\n\n## Abstract\n\nThis is a test abstract.\n\n## Content\n\nThis is test content.',
      },
      {
        pmid: '67890',
        fullText: null,
      },
    ];

    mockPubMedAPI.getFullText.mockResolvedValue(mockResults);

    const handler = createGetFullTextHandler(mockPubMedOptions);
    const result = await handler.getFullText(['12345', '67890']);

    expect(mockPubMedAPI.getFullText).toHaveBeenCalledWith(['12345', '67890']);
    expect(result).toEqual(mockResults);
  });

  it('should handle empty pmids array', async () => {
    mockPubMedAPI.getFullText.mockResolvedValue([]);

    const handler = createGetFullTextHandler(mockPubMedOptions);
    const result = await handler.getFullText([]);

    expect(mockPubMedAPI.getFullText).toHaveBeenCalledWith([]);
    expect(result).toEqual([]);
  });

  it('should handle single pmid', async () => {
    const mockResults = [
      {
        pmid: '12345',
        fullText: '# Single Article\n\n## Abstract\n\nSingle test abstract.',
      },
    ];

    mockPubMedAPI.getFullText.mockResolvedValue(mockResults);

    const handler = createGetFullTextHandler(mockPubMedOptions);
    const result = await handler.getFullText(['12345']);

    expect(mockPubMedAPI.getFullText).toHaveBeenCalledWith(['12345']);
    expect(result).toEqual(mockResults);
  });

  it('should work with minimal options (no API key)', () => {
    const minimalOptions = {
      email: 'test@example.com',
    };

    const handler = createGetFullTextHandler(minimalOptions);
    
    expect(createPubMedAPI).toHaveBeenCalledWith(minimalOptions);
    expect(handler).toBeDefined();
  });

  it('should propagate errors from pubmed API', async () => {
    const errorMessage = 'PubMed API error';
    mockPubMedAPI.getFullText.mockRejectedValue(new Error(errorMessage));

    const handler = createGetFullTextHandler(mockPubMedOptions);

    await expect(handler.getFullText(['invalid-pmid'])).rejects.toThrow(errorMessage);
  });

  it('should handle articles with no full text available', async () => {
    const mockResults = [
      {
        pmid: '12345',
        fullText: '# Available Article\n\nFull text content here.',
      },
      {
        pmid: '67890',
        fullText: null,
      },
      {
        pmid: '11111',
        fullText: null,
      },
    ];

    mockPubMedAPI.getFullText.mockResolvedValue(mockResults);

    const handler = createGetFullTextHandler(mockPubMedOptions);
    const result = await handler.getFullText(['12345', '67890', '11111']);

    expect(result).toEqual(mockResults);
    expect(result[0].fullText).toBeTruthy();
    expect(result[1].fullText).toBeNull();
    expect(result[2].fullText).toBeNull();
  });
});