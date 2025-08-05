#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createSearchHandler } from './handlers/search.js';
import { createFetchSummaryHandler } from './handlers/fetch-summary.js';
import { createGetFullTextHandler } from './handlers/get-fulltext.js';
import pkg from '../package.json' with { type: 'json' };
const { name: serverName, version: serverVersion } = pkg;

const server = new McpServer(
  {
    name: serverName,
    version: serverVersion,
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed: Record<string, string> = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = args[i + 1];
      if (value && !value.startsWith('--')) {
        parsed[key] = value;
        i++; // Skip the value in the next iteration
      }
    }
  }
  
  return parsed;
}

const cmdArgs = parseArgs();

// Read configuration from environment variables and command line arguments
const email = cmdArgs.email || process.env.PUBMED_EMAIL;
const apiKey = cmdArgs['api-key'] || process.env.PUBMED_API_KEY;
const cacheDir = cmdArgs['cache-dir'] || process.env.PUBMED_CACHE_DIR;
const cacheTTL = cmdArgs['cache-ttl'] || process.env.PUBMED_CACHE_TTL;

if (!email) {
  console.error(`ERROR: PUBMED_EMAIL environment variable or --email argument is required
  
  Configuration options:
    Environment variables:
      PUBMED_EMAIL (required): Your email address for PubMed API requests
      PUBMED_API_KEY (optional): Your PubMed API key for higher rate limits
      PUBMED_CACHE_DIR (optional): Directory path for caching API responses
      PUBMED_CACHE_TTL (optional): Cache TTL in seconds (default: 86400)
    
    Command line arguments:
      --email <email>: Your email address for PubMed API requests
      --api-key <key>: Your PubMed API key for higher rate limits
      --cache-dir <path>: Directory path for caching API responses
      --cache-ttl <seconds>: Cache TTL in seconds (default: 86400)`);
  process.exit(1);
}

const pubmedOptions = {
  email,
  ...(apiKey && { apiKey }),
  ...(cacheDir && { cacheDir }),
  ...(cacheTTL && { cacheTTL: parseInt(cacheTTL) })
};

const searchHandler = createSearchHandler(pubmedOptions);
const fetchSummaryHandler = createFetchSummaryHandler(pubmedOptions);
const getFullTextHandler = createGetFullTextHandler(pubmedOptions);

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
      const articles = await fetchSummaryHandler.fetchSummary([pmid as string]);
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
      const results = await searchHandler.search(query, searchOptions);
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
      const results = await fetchSummaryHandler.fetchSummary(pmids);
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
      const results = await getFullTextHandler.getFullText(pmids);
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



async function main() {
  const configMessage = `
  MCP PubMed Server 
    Configuration:
      Email: ${email}
      API Key: ${apiKey ? 'Configured' : 'Not configured (using default rate limits)'}
      Cache Directory: ${cacheDir || 'Not configured (caching disabled)'}
      Cache TTL: ${cacheTTL ? `${cacheTTL} seconds` : '86400 seconds (default)'}
  `;
  console.log(configMessage);
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log('MCP PubMed server running on stdio');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Server error:', error);
    process.exit(1);
  });
}

await main();