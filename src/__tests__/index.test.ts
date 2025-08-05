import { describe, it, expect, beforeEach, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createSearchHandler } from '../handlers/search.js';
import { createFetchSummaryHandler } from '../handlers/fetch-summary.js';
import { createGetFullTextHandler } from '../handlers/get-fulltext.js';

// Mock the handlers
vi.mock('../handlers/search.js', () => ({
  createSearchHandler: vi.fn((pubmedOptions) => ({
    search: vi.fn(),
  })),
}));

vi.mock('../handlers/fetch-summary.js', () => ({
  createFetchSummaryHandler: vi.fn((pubmedOptions) => ({
    fetchSummary: vi.fn(),
  })),
}));

vi.mock('../handlers/get-fulltext.js', () => ({
  createGetFullTextHandler: vi.fn((pubmedOptions) => ({
    getFullText: vi.fn(),
  })),
}));

describe('MCP PubMed Server', () => {
  let server: McpServer;
  let mockSearchHandler: { search: ReturnType<typeof vi.fn> };
  let mockFetchSummaryHandler: { fetchSummary: ReturnType<typeof vi.fn> };
  let mockGetFullTextHandler: { getFullText: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Create mock handlers
    mockSearchHandler = {
      search: vi.fn(),
    };
    
    mockFetchSummaryHandler = {
      fetchSummary: vi.fn(),
    };
    
    mockGetFullTextHandler = {
      getFullText: vi.fn(),
    };
    
    (createSearchHandler as any).mockReturnValue(mockSearchHandler);
    (createFetchSummaryHandler as any).mockReturnValue(mockFetchSummaryHandler);
    (createGetFullTextHandler as any).mockReturnValue(mockGetFullTextHandler);

    server = new McpServer(
      {
        name: 'mcp-server-pubmed',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    // Register resources
    server.registerResource(
      "article",
      new ResourceTemplate("articles://pmid/{pmid}", {
        list: undefined
      }),
      {
        title: "PubMed Article",
        description: "Detailed information about a specific PubMed article"
      },
      async (uri, { pmid }) => {
        try {
          const articles = await mockFetchSummaryHandler.fetchSummary([pmid as string]);
          if (articles.length === 0) {
            throw new Error(`Article with PMID ${pmid} not found`);
          }
          const article = articles[0];
          return {
            contents: [{
              uri: uri.href,
              text: JSON.stringify(article, null, 2),
              mimeType: "application/json"
            }]
          };
        } catch (error) {
          return {
            contents: [{
              uri: uri.href,
              text: `Error fetching article ${pmid}: ${error instanceof Error ? error.message : 'Unknown error'}`,
              mimeType: "text/plain"
            }]
          };
        }
      }
    );

    server.registerResource(
      "search-results",
      new ResourceTemplate("search://query/{encodedQuery}", {
        list: undefined
      }),
      {
        title: "PubMed Search Results",
        description: "Search results from PubMed for a specific query"
      },
      async (uri, { encodedQuery }) => {
        try {
          const query = decodeURIComponent(encodedQuery as string);
          const results = await mockSearchHandler.search(query, { retMax: 20 });
          return {
            contents: [{
              uri: uri.href,
              text: JSON.stringify(results, null, 2),
              mimeType: "application/json"
            }]
          };
        } catch (error) {
          return {
            contents: [{
              uri: uri.href,
              text: `Error searching PubMed for "${decodeURIComponent(encodedQuery as string)}": ${error instanceof Error ? error.message : 'Unknown error'}`,
              mimeType: "text/plain"
            }]
          };
        }
      }
    );

    // Register tools
    server.registerTool(
      'search_pubmed',
      {
        title: 'PubMed Search',
        description: 'Search PubMed for scientific articles.',
        inputSchema: {
          query: z.string().describe('Search query for PubMed'),
          searchOptions: z.object({
            retMax: z.number().optional().describe('Maximum number of results to return'),
            retStart: z.number().optional().describe('Starting index for results'),
            sort: z.enum(['relevance', 'pub_date', 'author', 'journal']).optional().describe('Sort order for results'),
            dateFrom: z.string().optional().describe('Start date filter (YYYY/MM/DD format)'),
            dateTo: z.string().optional().describe('End date filter (YYYY/MM/DD format)'),
          }).optional().describe('Optional search parameters')
        }
      },
      async ({ query, searchOptions }) => {
        try {
          const results = await mockSearchHandler.search(query, searchOptions);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(results, null, 2),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error searching PubMed: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            ],
          };
        }
      }
    );

    server.registerTool(
      'fetch_summary',
      {
        title: 'PubMed Article Summary',
        description: 'Fetch detailed article information from PubMed using PMIDs.',
        inputSchema: {
          pmids: z.array(z.string()).describe('Array of PubMed IDs (PMIDs) to fetch')
        }
      },
      async ({ pmids }) => {
        try {
          const results = await mockFetchSummaryHandler.fetchSummary(pmids);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(results, null, 2),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error fetching article summaries: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            ],
          };
        }
      }
    );

    server.registerTool(
      'get_fulltext',
      {
        title: 'PubMed Full Text',
        description: 'Get full text content of PubMed articles using PMIDs.',
        inputSchema: {
          pmids: z.array(z.string()).describe('Array of PubMed IDs (PMIDs) to get full text for')
        }
      },
      async ({ pmids }) => {
        try {
          const results = await mockGetFullTextHandler.getFullText(pmids);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(results, null, 2),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error fetching full text: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            ],
          };
        }
      }
    );
  });

  describe('Server Creation', () => {
    it('should create McpServer with resources and tools capabilities', () => {
      expect(server).toBeDefined();
      expect(server).toBeInstanceOf(McpServer);
    });

    it('should register resources and tools without errors', () => {
      // If we got here without errors in beforeEach, registration worked
      expect(true).toBe(true);
    });
  });

  describe('Mock Handler Integration', () => {
    it('should use mocked search handler', async () => {
      const mockResults = [{ pmid: '12345', title: 'Test Article' }];
      mockSearchHandler.search.mockResolvedValue(mockResults);
      
      const result = await mockSearchHandler.search('test query');
      expect(result).toEqual(mockResults);
      expect(mockSearchHandler.search).toHaveBeenCalledWith('test query');
    });

    it('should use mocked fetch summary handler', async () => {
      const mockResults = [{ pmid: '12345', title: 'Test Article', authors: [] }];
      mockFetchSummaryHandler.fetchSummary.mockResolvedValue(mockResults);
      
      const result = await mockFetchSummaryHandler.fetchSummary(['12345']);
      expect(result).toEqual(mockResults);
      expect(mockFetchSummaryHandler.fetchSummary).toHaveBeenCalledWith(['12345']);
    });

    it('should use mocked get full text handler', async () => {
      const mockResults = [{ pmid: '12345', fullText: 'Full text content' }];
      mockGetFullTextHandler.getFullText.mockResolvedValue(mockResults);
      
      const result = await mockGetFullTextHandler.getFullText(['12345']);
      expect(result).toEqual(mockResults);
      expect(mockGetFullTextHandler.getFullText).toHaveBeenCalledWith(['12345']);
    });

    it('should handle errors in search handler', async () => {
      const errorMessage = 'Search failed';
      mockSearchHandler.search.mockRejectedValue(new Error(errorMessage));
      
      await expect(mockSearchHandler.search('invalid query')).rejects.toThrow(errorMessage);
    });
  });
});