# pubmed-mcp: MCP Server for PubMed

[PubMed](https://pubmed.ncbi.nlm.nih.gov/) is a free database maintained by the National Library of Medicine (NLM) at the National Institutes of Health (NIH), offering access to over 30 million citations for biomedical literature.

This is MCP server for searching PubMed scientific articles using NCBI E-utilities API.

## Features

- Search PubMed articles with flexible query parameters
- Fetch detailed article information including abstracts, authors, and DOI
- Built-in rate limiting (3 req/s without API key, 10 req/s with API key)
- Caching support for improved performance
- TypeScript implementation with full type safety

## Usage with Claude Code

Node.js v18 or higher is required. Claude Code typically installs Node.js during setup.

### Adding pubmed-mcp in project scope

```bash
claude mcp add pubmed-mcp \
  --scope project \
  npx -y @ncukondo/pubmed-mcp \
  --email your@email.com
```

The `-y` option is used to skip the confirmation prompt during the initial installation.  
The `--scope project` option installs the server in project scope, creating a `.mcp.json` file in the project root to store the MCP server settings.

If you omit `--scope project`, the server will be installed globally:

```bash
claude mcp add pubmed-mcp \
  npx -y @ncukondo/pubmed-mcp \
  --email your@email.com
```

You can also set the email address via the `PUBMED_EMAIL` environment variable.

### Adding pubmed-mcp with an API key

Specifying a PubMed API key relaxes PubMed’s request rate limits. Obtain an API key by creating an NCBI account and visiting the API Key Management page:

```bash
claude mcp add pubmed-mcp \
  --scope project \
  npx -y @ncukondo/pubmed-mcp \
  --email your@email.com \
  --api-key your-ncbi-api-key
```

Alternatively, set the API key via the `PUBMED_API_KEY` environment variable.

### Enabling caching

Enabling caching returns cached results for identical requests, reducing the number of API calls:

```bash
claude mcp add pubmed-mcp \
  --scope project npx \
  -y @ncukondo/pubmed-mcp \
  --email your@email.com \
  --cache-dir ./pubmed-cache
```

Use `--cache-dir` to specify the cache directory, and `--cache-ttl` to set the cache time-to-live in seconds (default: 1 day / 86400 seconds):

```bash
claude mcp add pubmed-mcp \
  --scope project \
  npx -y @ncukondo/pubmed-mcp \
  --email your@email.com \
  --cache-dir ./pubmed-cache \
  --cache-ttl 3600
```

### Configuration via JSON file

Instead of running commands, you can edit the JSON file directly.  
- For project scope: edit `.mcp.json` in the project root.  
- For global scope: edit `~/.claude.json`.  

```json
{
  "mcpServers": {
    "pubmed": {
      "command": "npx",
      "args": [
        "-y",
        "@ncukondo/pubmed-mcp"
        ],
      "env": {
        "PUBMED_EMAIL": "your@email.com"
      }
    }
  }
}
```

## Usage with Claude Desktop

### 1. Edit Configuration File

Edit Claude Desktop's configuration file (`~/.claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "pubmed": {
      "command": "npx",
      "args": [
        "-y",
        "@ncukondo/pubmed-mcp"
      ],
      "env": {
        "PUBMED_EMAIL": "your-email@example.com"
      }
    }
  }
}
```

### 2. Configuration with Caching

```json
{
  "mcpServers": {
    "pubmed": {
      "command": "npx",
      "args": [
        "-y",
        "@ncukondo/pubmed-mcp",
        "--cache-dir",
        "./cache",
        "--cache-ttl",
        "3600"
      ],
      "env": {
        "PUBMED_EMAIL": "your-email@example.com",
        "PUBMED_API_KEY": "your-api-key"
      }
    }
  }
}
```

### 3. Configuration for Globally Installed Version

If you've installed globally:

```bash
npm install -g @ncukondo/pubmed-mcp
```

```json
{
  "mcpServers": {
    "pubmed": {
      "command": "pubmed-mcp",
      "args": ["--cache-dir", "./pubmed-cache"],
      "env": {
        "PUBMED_EMAIL": "your-email@example.com"
      }
    }
  }
}
```

## Requirements

### System Requirements

- **Node.js**: >= 18
- **npm**: Latest version recommended

### Environment Variables (Recommended)

- `PUBMED_EMAIL`: Email address recommended by NCBI
- `PUBMED_API_KEY`: API key for higher rate limits (optional)

## How to Use

### Available Tools

#### search

Search PubMed articles with query parameters.

**Parameters:**

- `query` (required): Search query string
- `max_results`: Maximum number of results (default: 20)
- `sort`: Sort order for results

**Example usage:**

```
Search for "COVID-19 vaccine efficacy"
```

#### fetch_summary

Fetch detailed summary for specific PubMed articles.

**Parameters:**

- `pmids` (required): Array of PubMed IDs to fetch

**Example usage:**

```
Get detailed information for PMID 12345678
```

#### get_full_text

Get full text information for PubMed articles (when available).

**Parameters:**

- `pmids` (required): Array of PubMed IDs

## MCP Server Development

### Development Environment Setup

```bash
git clone 
cd mcp-server-pubmed
npm install
```

### Development Commands

```bash
# Build
npm run build

# Development mode (watch)
npm run dev

# Run tests
npm test

# Test (CI)
npm run test:run
```

### Directory Structure

```
src/
├── index.ts          # Main server file
├── pubmed-api.ts     # PubMed API implementation
├── handlers/         # Request handlers
└── __tests__/        # Test files
```

### Testing During Development

```bash
# Start server locally
npm run build
node dist/index.js

# Test with MCP client in another terminal
# Or use Claude Desktop config with "command": "node", "args": ["/absolute/path/to/dist/index.js"]
```

### Debugging

```bash
# Start with debug mode
DEBUG=* node dist/index.js

# Debug with caching
DEBUG=* node dist/index.js --cache-dir ./debug-cache --cache-ttl 300
```

### Packaging

```bash
# Build for distribution
npm run prepublishOnly

# Verify package
npm pack
```

## Rate Limits

- Without API key: 3 requests per second
- With API key: 10 requests per second

NCBI recommends including an email address in requests for better support.

## Technical Specifications

- **Runtime**: Node.js (>=18)
- **Language**: TypeScript with ES2022 target
- **Module System**: ESM
- **Build Tool**: Vite
- **Testing**: Vitest
- **MCP SDK**: @modelcontextprotocol/sdk v1.17.1

## License

MIT License