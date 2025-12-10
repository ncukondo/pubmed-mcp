/**
 * PubMed API utility using NCBI E-utilities
 * Based on https://www.ncbi.nlm.nih.gov/books/NBK25499/
 */

import { XMLParser } from 'fast-xml-parser';
import { promises as fs } from 'fs';
import { join } from 'path';
import { z } from 'zod';

const ElinkObjectIdSchema = z.object({
  url: z.string().optional()
}).passthrough();

const ElinkIdUrlEntrySchema = z.object({
  url: z.union([z.string(), z.array(z.string())]).optional(),
  objectid: z.union([ElinkObjectIdSchema, z.array(ElinkObjectIdSchema)]).optional(),
  id: z.union([z.string(), z.number()]).optional()
}).passthrough();

const ElinkIdUrlSetSchema = z.object({
  idurl: z.union([ElinkIdUrlEntrySchema, z.array(ElinkIdUrlEntrySchema)]).optional()
}).passthrough();

const ElinkLinksetSchema = z.object({
  dbfrom: z.string().optional(),
  ids: z.array(z.union([z.string(), z.number()])).optional(),
  idurlset: ElinkIdUrlSetSchema.optional()
}).passthrough();

export const ElinkLLinksResponseSchema = z.object({
  linksets: z.array(ElinkLinksetSchema).optional()
}).transform(v => ({
  linksets: v.linksets ?? []
}));

export type ElinkLLinksResponse = z.infer<typeof ElinkLLinksResponseSchema>;

// Global rate limiter to ensure requests across all API instances respect rate limits
class GlobalRateLimiter {
  private static instance: GlobalRateLimiter;
  private queue: Promise<void> = Promise.resolve();

  static getInstance(): GlobalRateLimiter {
    if (!GlobalRateLimiter.instance) {
      GlobalRateLimiter.instance = new GlobalRateLimiter();
    }
    return GlobalRateLimiter.instance;
  }

  async execute<T>(delayMs: number, task: () => Promise<T>): Promise<T> {
    const execution = this.queue.then(async () => {
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return task();
    });

    // Update queue for next request (ignore errors to prevent queue from stopping)
    this.queue = execution.then(() => { }, () => { });

    return execution;
  }
}

export interface PubMedOptions {
  email: string;
  apiKey?: string;
  cacheDir?: string;
  cacheTTL?: number; // Cache TTL in seconds, default: 86400 (1 day)
}

export interface SearchResult {
  idList: string[];
  count: number;
  retMax: number;
  retStart: number;
}

export interface Article {
  pmid: string;
  title: string;
  authors: string[];
  abstract?: string;
  journal: string;
  pubDate: string;
  doi?: string;
  pmcId?: string;
  fullText?: string;
  hasFullText?: boolean;
}

export interface FullTextResult {
  pmid: string;
  fullText: string | null;
  links?: string[];
}

export interface PubMedAPI {
  search: (query: string, options?: SearchOptions) => Promise<SearchResult>;
  fetchArticles: (pmids: string[]) => Promise<Article[]>;
  searchAndFetch: (query: string, options?: SearchAndFetchOptions) => Promise<Article[]>;
  checkFullTextAvailability: (pmids: ReadonlyArray<string>) => Promise<ReadonlyArray<readonly [pmid: string, result: { pmcId?: string; links: string[] }]>>;
  getFullText: (pmids: string[]) => Promise<FullTextResult[]>;
}

export interface SearchOptions {
  retMax?: number;
  retStart?: number;
  sort?: 'relevance' | 'pub_date' | 'author' | 'journal';
  dateFrom?: string;
  dateTo?: string;
}

export interface SearchAndFetchOptions extends SearchOptions {
  maxResults?: number;
}

const BASE_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

/**
 * Initialize PubMed API client with email and optional API key
 */
// Full text availability check result
export interface FullTextAvailability {
  hasFullText: boolean;
  pmcId?: string;
  links?: string[];
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface CacheUtils {
  ensureCacheDir: () => Promise<void>;
  getCachedSummary: (pmid: string) => Promise<Article | null>;
  setCachedSummary: (pmid: string, article: Article) => Promise<void>;
  getCachedFullText: (pmid: string) => Promise<string | null>;
  setCachedFullText: (pmid: string, fullText: string) => Promise<void>;
  isCacheEntryValid: (timestamp: number) => boolean;
}

export function createPubMedAPI(options: PubMedOptions): PubMedAPI {
  const { email, apiKey, cacheDir, cacheTTL = 86400 } = options;

  const buildUrl = (tool: string, params: Record<string, string | number>) => {
    const url = new URL(`${BASE_URL}/${tool}.fcgi`);
    url.searchParams.set('email', email);
    if (apiKey) {
      url.searchParams.set('api_key', apiKey);
    }

    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, String(value));
    });

    return url.toString();
  };

  // Cache utility functions
  const createCacheUtils = (): CacheUtils | null => {
    if (!cacheDir) return null;

    const summaryDir = join(cacheDir, 'summary');
    const fulltextDir = join(cacheDir, 'fulltext');

    const ensureCacheDir = async (): Promise<void> => {
      try {
        await fs.mkdir(summaryDir, { recursive: true });
        await fs.mkdir(fulltextDir, { recursive: true });
      } catch (error) {
        console.error('Error creating cache directories:', error);
        throw error;
      }
    };

    const isCacheEntryValid = (timestamp: number): boolean => {
      const now = Date.now();
      const age = (now - timestamp) / 1000; // Convert to seconds
      return age < cacheTTL;
    };

    const getCachedSummary = async (pmid: string): Promise<Article | null> => {
      try {
        const filePath = join(summaryDir, `${pmid}.json`);
        const content = await fs.readFile(filePath, 'utf8');
        const cacheEntry: CacheEntry<Article> = JSON.parse(content);

        if (isCacheEntryValid(cacheEntry.timestamp)) {
          return cacheEntry.data;
        } else {
          // Cache expired, remove the file
          await fs.unlink(filePath).catch(() => { });
          return null;
        }
      } catch (error) {
        // File doesn't exist or other error
        return null;
      }
    };

    const setCachedSummary = async (pmid: string, article: Article): Promise<void> => {
      try {
        await ensureCacheDir();
        const filePath = join(summaryDir, `${pmid}.json`);
        const cacheEntry: CacheEntry<Article> = {
          data: article,
          timestamp: Date.now()
        };
        await fs.writeFile(filePath, JSON.stringify(cacheEntry, null, 2));
      } catch (error) {
        console.error('Error writing summary cache:', error);
      }
    };

    const getCachedFullText = async (pmid: string): Promise<string | null> => {
      try {
        const filePath = join(fulltextDir, `${pmid}.md`);
        const content = await fs.readFile(filePath, 'utf8');
        const lines = content.split('\n');

        // First line should contain timestamp metadata
        const timestampMatch = lines[0].match(/^<!--\s*timestamp:\s*(\d+)\s*-->$/);
        if (!timestampMatch) {
          // Old format or corrupted file, remove it
          await fs.unlink(filePath).catch(() => { });
          return null;
        }

        const timestamp = parseInt(timestampMatch[1]);
        if (isCacheEntryValid(timestamp)) {
          // Return content without the timestamp line
          return lines.slice(1).join('\n').trim();
        } else {
          // Cache expired, remove the file
          await fs.unlink(filePath).catch(() => { });
          return null;
        }
      } catch (error) {
        // File doesn't exist or other error
        return null;
      }
    };

    const setCachedFullText = async (pmid: string, fullText: string): Promise<void> => {
      try {
        await ensureCacheDir();
        const filePath = join(fulltextDir, `${pmid}.md`);
        const timestamp = Date.now();
        const content = `<!-- timestamp: ${timestamp} -->\n${fullText}`;
        await fs.writeFile(filePath, content);
      } catch (error) {
        console.error('Error writing fulltext cache:', error);
      }
    };

    return {
      ensureCacheDir,
      getCachedSummary,
      setCachedSummary,
      getCachedFullText,
      setCachedFullText,
      isCacheEntryValid
    };
  };

  const cache = createCacheUtils();

  // Decode HTML entities to readable characters
  const decodeHtmlEntities = (text: string): string => {
    const entityMap: { [key: string]: string } = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&#8217;': "'", // right single quotation mark
      '&#8216;': "'", // left single quotation mark
      '&#8220;': '"', // left double quotation mark
      '&#8221;': '"', // right double quotation mark
      '&#8211;': '–', // en dash
      '&#8212;': '—', // em dash
      '&#8722;': '−', // minus sign
      '&#160;': ' ',  // non-breaking space
      '&#8201;': ' ', // thin space
      '&#8804;': '≤', // less than or equal to
      '&#8805;': '≥', // greater than or equal to
      '&nbsp;': ' '
    };

    return text.replace(/&[#\w]+;/g, (entity) => {
      return entityMap[entity] || entity;
    });
  };

  // Extract structured sections from PMC article body
  type ExtractTextFn = (node: unknown) => string;

  interface SectionNode {
    title?: unknown;
    sec?: SectionNode | SectionNode[];
    [key: string]: unknown;
  }

  interface BodyNode {
    sec?: SectionNode | SectionNode[];
  }

  const extractStructuredContent = (
    bodyNode: BodyNode,
    extractTextFromNode: ExtractTextFn
  ): string => {
    if (!bodyNode.sec) {
      return '';
    }

    const sections = Array.isArray(bodyNode.sec)
      ? bodyNode.sec
      : [bodyNode.sec];

    const content = sections.flatMap(section => {
      if (!section) return [];

      // Extract section title
      const sectionTitle = section.title
        ? [`### ${extractTextFromNode(section.title)}`]
        : [];

      // Extract section content
      const sectionContent = [extractTextFromNode(section)];
      return [...sectionTitle, ...sectionContent];
    }).join('\n\n').trim();

    return content;
  };

  const makeRequest = async (url: string): Promise<any> => {
    // Rate limiting: 3 requests per second without API key, 10 with API key
    const delayMs = apiKey ? 100 : 334;
    const limiter = GlobalRateLimiter.getInstance();

    return limiter.execute(delayMs, async () => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.text();
    });
  };

  // Initialize XML parser with appropriate options
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    parseAttributeValue: true,
    trimValues: true
  });

  const search = async (query: string, options: SearchOptions = {}): Promise<SearchResult> => {
    const {
      retMax = 20,
      retStart = 0,
      sort = 'relevance',
      dateFrom,
      dateTo
    } = options;

    let searchQuery = query;
    if (dateFrom || dateTo) {
      const from = dateFrom || '1900/01/01';
      const to = dateTo || '3000/12/31';
      searchQuery += ` AND ("${from}"[Date - Publication] : "${to}"[Date - Publication])`;
    }

    const params = {
      db: 'pubmed',
      term: searchQuery,
      retmax: retMax,
      retstart: retStart,
      sort: sort,
      usehistory: 'y'
    };

    const url = buildUrl('esearch', params);
    const xmlResponse = await makeRequest(url);
    const parsedData = parser.parse(xmlResponse);

    const searchResult = parsedData.eSearchResult;
    const idList = searchResult.IdList ?
      (Array.isArray(searchResult.IdList.Id) ? searchResult.IdList.Id.map(String) : [String(searchResult.IdList.Id)]) :
      [];
    const count = parseInt(String(searchResult.Count || 0));

    return {
      idList,
      count,
      retMax,
      retStart
    };
  };

  const fetchArticles = async (pmids: ReadonlyArray<string>): Promise<Article[]> => {
    if (pmids.length === 0) return [];

    // Check cache for existing articles if cache is enabled
    const cachedArticles: Article[] = !cache
      ? []
      : (await Promise.all(pmids.map(async (pmid) => {
        const cached = await cache.getCachedSummary(pmid);
        return cached ? [cached] : [];
      }))).flat();
    const uncachedPmids: string[] = pmids.filter(
      pmid => !cachedArticles.some(article => article.pmid === pmid)
    );

    // If all articles are cached, return them
    if (uncachedPmids.length === 0) {
      return cachedArticles;
    }

    // Fetch uncached articles from API
    const params = {
      db: 'pubmed',
      id: uncachedPmids.join(','),
      retmode: 'xml',
      rettype: 'abstract'
    };

    const url = buildUrl('efetch', params);
    const xmlResponse = await makeRequest(url);
    const parsedData = parser.parse(xmlResponse);

    const fetchedArticles: Article[] = [];
    const pubmedArticles = parsedData.PubmedArticleSet?.PubmedArticle || [];
    const articlesArray = Array.isArray(pubmedArticles) ? pubmedArticles : [pubmedArticles];

    for (const article of articlesArray) {
      if (!article.MedlineCitation) continue;

      const medlineCitation = article.MedlineCitation;
      const pubmedData = article.PubmedData;

      const pmid = String(medlineCitation.PMID?.['#text'] || medlineCitation.PMID || '');

      const title = medlineCitation.Article?.ArticleTitle?.['#text'] || medlineCitation.Article?.ArticleTitle || '';

      // Extract authors
      const authors: string[] = [];
      const authorList = medlineCitation.Article?.AuthorList?.Author;
      if (authorList) {
        const authorsArray = Array.isArray(authorList) ? authorList : [authorList];
        authorsArray.forEach((author: any) => {
          const lastName = author.LastName?.['#text'] || author.LastName || '';
          const foreName = author.ForeName?.['#text'] || author.ForeName || '';
          if (lastName) {
            authors.push(foreName ? `${lastName}, ${foreName}` : lastName);
          }
        });
      }

      // Extract abstract
      const abstractText = medlineCitation.Article?.Abstract?.AbstractText;
      let abstract: string | undefined = undefined;
      if (abstractText) {
        if (Array.isArray(abstractText)) {
          // Handle multiple AbstractText sections
          abstract = abstractText
            .map((section: any) => {
              const text = section?.['#text'] || section;
              return typeof text === 'string' ? text : String(text);
            })
            .filter(text => text && text.trim())
            .join(' ')
            .trim() || undefined;
        } else {
          // Handle single AbstractText
          const text = abstractText?.['#text'] || abstractText;
          abstract = typeof text === 'string' ? text : (text ? String(text) : undefined);
        }
      }

      // Extract journal
      const journalTitle = medlineCitation.Article?.Journal?.Title?.['#text'] || medlineCitation.Article?.Journal?.Title || '';

      // Extract publication date
      const pubDateObj = medlineCitation.Article?.Journal?.JournalIssue?.PubDate;
      let pubDate = '';
      if (pubDateObj) {
        const year = pubDateObj.Year?.['#text'] || pubDateObj.Year || '';
        const month = pubDateObj.Month?.['#text'] || pubDateObj.Month || '';
        const day = pubDateObj.Day?.['#text'] || pubDateObj.Day || '';
        pubDate = [year, month, day].filter(Boolean).join('-');
      }

      // Extract DOI
      const eLocationIDs = medlineCitation.ELocationID;
      let doi = undefined;
      if (eLocationIDs) {
        const locations = Array.isArray(eLocationIDs) ? eLocationIDs : [eLocationIDs];
        const doiLocation = locations.find((loc: any) => loc['@_EIdType'] === 'doi');
        doi = doiLocation ? String(doiLocation['#text'] || doiLocation) : undefined;
      }

      // Extract PMC ID
      const articleIds = pubmedData?.ArticleIdList?.ArticleId;
      let pmcId = undefined;
      if (articleIds) {
        const ids = Array.isArray(articleIds) ? articleIds : [articleIds];
        const pmcIdObj = ids.find((id: any) => id['@_IdType'] === 'pmc');
        pmcId = pmcIdObj ? String(pmcIdObj['#text'] || pmcIdObj) : undefined;
      }

      const newArticle = {
        pmid,
        title,
        authors,
        abstract,
        journal: journalTitle,
        pubDate,
        doi,
        pmcId
      };

      fetchedArticles.push(newArticle);

      // Cache the new article if cache is enabled
      if (cache) {
        // For better reliability in tests, we wait for cache operations
        try {
          await cache.setCachedSummary(pmid, newArticle);
        } catch (err) {
          console.error('Error caching article:', err);
        }
      }
    }

    // Combine cached and fetched articles, maintaining the original order
    const allArticles = [...cachedArticles, ...fetchedArticles];
    return pmids.map(pmid => allArticles.find(article => article.pmid === pmid)).filter(Boolean) as Article[];
  };

  const searchAndFetch = async (query: string, options: SearchAndFetchOptions = {}): Promise<Article[]> => {
    const { maxResults = 20, ...searchOptions } = options;
    const searchResult = await search(query, { ...searchOptions, retMax: maxResults });
    return fetchArticles(searchResult.idList);
  };

  const getPmcIdFromIdConverter = async (pmids: ReadonlyArray<string>) => {
    if (pmids.length === 0) return [];

    const url = new URL('https://pmc.ncbi.nlm.nih.gov/utils/idconv/v1.0/');
    url.searchParams.set('format', 'json');
    url.searchParams.set('ids', pmids.join(','));
    if (email) url.searchParams.set('email', email);
    url.searchParams.set('tool', 'pubmed-mcp');

    try {
      const jsonText = await makeRequest(url.toString());
      const data = JSON.parse(jsonText);
      const records: any[] = Array.isArray(data?.records) ? data.records : [];

      const byPmid = new Map<string, any>();
      for (const rec of records) {
        const rPmid = rec?.pmid ? String(rec.pmid) : undefined;
        if (rPmid) byPmid.set(rPmid, rec);
      }

      return pmids.map(pmid => {
        const rec = byPmid.get(String(pmid));
        const pmcId = rec?.pmcid ? String(rec.pmcid) : undefined;
        return [pmid, pmcId] as const;
      }).filter(entry => entry[1]) as [pmid: string, pmcId: string][];
    } catch (error) {
      console.error('Error querying PMC ID Converter:', error);
      return [];
    }
  };

  const getLinksFromId = async (pmids: ReadonlyArray<string>) => {
    if (pmids.length === 0) return [];
    const parseLinksFromJson = (jsonText: string) => {
      const data = JSON.parse(jsonText);
      const response = ElinkLLinksResponseSchema.parse(data);
      const linksets = response.linksets;
      return linksets.map(set => {
        const ids = Array.isArray(set?.ids) ? set.ids.map((v: any) => String(v)) : [];
        const urls: string[] = [];

        const idurlset = set?.idurlset;
        const idurl = idurlset?.idurl;
        const entries = Array.isArray(idurl) ? idurl : (idurl ? [idurl] : []);

        for (const entry of entries) {
          const rawUrl = entry?.url;
          if (typeof rawUrl === 'string') {
            urls.push(rawUrl);
          } else if (Array.isArray(rawUrl)) {
            for (const u of rawUrl) {
              if (typeof u === 'string') urls.push(u);
            }
          }

          // Some responses include nested objectid entries with urls
          const objectid = entry?.objectid;
          const objArr = Array.isArray(objectid) ? objectid : (objectid ? [objectid] : []);
          for (const oi of objArr) {
            const u = oi?.url;
            if (typeof u === 'string') urls.push(u);
          }
        }

        const filtered = urls
          .filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u))
          .map((u) => u.trim());

        return [ids, filtered] as const;
      }).filter(([ids]) => ids.length > 0).map(([ids, urls]) => {
        return ids.map(id => [id, urls] as LinkTuple);
      }).flat();
    };


    type LinkTuple = readonly [pmid: string, links: string[]];

    const BATCH_SIZE = 200;
    const chunkedPmids = pmids.reduce((acc: string[][], pmid, index) => {
      const chunkIndex = Math.floor(index / BATCH_SIZE);
      if (!acc[chunkIndex]) acc[chunkIndex] = [];
      acc[chunkIndex].push(pmid);
      return acc;
    }, [] as string[][]);
    const chunkedResults = await Promise.all(chunkedPmids.map(async pmids => {
      const params = {
        dbfrom: 'pubmed',
        id: pmids.join(','),
        retmode: 'json',
        cmd: 'llinks'
      };
      const url = buildUrl('elink', params);

      const jsonText = await makeRequest(url);
      const links = parseLinksFromJson(jsonText);
      return pmids.map(pmid => {
        const found = links.find(([ids]) => ids.includes(pmid));
        return found ? [pmid, found[1]] as LinkTuple : [pmid, []] as LinkTuple;
      });

    }));
    return chunkedResults.flat();
  }


  const checkFullTextAvailability = async (pmids: ReadonlyArray<string>) => {
    if (pmids.length === 0) return [];
    const summaries = await fetchArticles(pmids);
    const resultsFromSummaries = summaries.filter(article => article.pmcId).map(article => ([
      article.pmid, article.pmcId as string] as const));
    const resultsFromIdConverter = await getPmcIdFromIdConverter(pmids.filter(pmid => !resultsFromSummaries.some(([pmidExists]) => pmidExists === pmid)));
    const pmcIdEntries = Object.fromEntries([...resultsFromSummaries, ...resultsFromIdConverter]);
    const links = await getLinksFromId(pmids)
    return links.map(([pmid, urls]) => {
      const pmcId = pmcIdEntries[pmid];
      return [pmid, { pmcId, links: urls }] as const;
    });
  };

  const getFullText = async (pmids: string[]): Promise<FullTextResult[]> => {
    if (pmids.length === 0) return [];

    // Check cache for existing full texts if cache is enabled
    const cachedResults: FullTextResult[] = cache
      ? (await Promise.all(pmids.map(async (pmid) => {
        const cached = await cache.getCachedFullText(pmid);
        return cached ? { pmid, fullText: cached } : null;
      }))).filter((result) => result !== null)
      : [];
    const uncachedPmids: string[] = pmids.filter(
      pmid => !cachedResults.some(result => result.pmid === pmid)
    );

    // If all full texts are cached, return them
    if (uncachedPmids.length === 0) {
      return cachedResults;
    }

    // Batch check full text availability for uncached PMIDs
    const availabilityResultsArray = await checkFullTextAvailability(uncachedPmids);

    // Convert array to map for easier lookup
    const availabilityResults = Object.fromEntries(availabilityResultsArray);

    // Group PMIDs by their PMC IDs for batch fetching
    const pmcToPmidMap: { [pmcId: string]: string[] } = {};
    const resultsMap: { [pmid: string]: FullTextResult } = {};

    // Initialize results and group by PMC ID
    uncachedPmids.forEach(pmid => {
      const availability = availabilityResults[pmid];
      if (availability?.pmcId) {
        if (!pmcToPmidMap[availability.pmcId]) {
          pmcToPmidMap[availability.pmcId] = [];
        }
        pmcToPmidMap[availability.pmcId].push(pmid);
        // Store links for later assignment
        resultsMap[pmid] = { pmid, fullText: null, links: availability.links };
      } else {
        resultsMap[pmid] = { pmid, fullText: null, links: availability?.links || [] };
      }
    });

    // Batch fetch full texts for PMC IDs
    for (const [pmcId, relatedPmids] of Object.entries(pmcToPmidMap)) {
      try {
        const params = {
          db: 'pmc',
          id: pmcId,
          retmode: 'xml'
          // Note: PMC database only supports rettype: null (empty) per NCBI documentation
        };

        const url = buildUrl('efetch', params);
        const xmlResponse = await makeRequest(url);
        const parsedData = parser.parse(xmlResponse);

        const article = parsedData['pmc-articleset']?.article || parsedData.pmc_articleset?.article || parsedData.article;

        if (article) {
          const extractTextFromNode = (node: unknown): string => {
            if (node == null) return ''

            if (typeof node === 'string') {
              return decodeHtmlEntities(node)
            }

            if (Array.isArray(node)) {
              return node
                .map(extractTextFromNode)
                .filter(text => text.length > 0)
                .join('\n\n') // Use paragraph breaks for array elements
            }

            if (typeof node === 'object') {
              const obj = node as Record<string, unknown>
              const textValue = obj['#text']
              if (typeof textValue === 'string') {
                return decodeHtmlEntities(textValue)
              }

              let text = ''
              for (const value of Object.values(obj)) {
                text += extractTextFromNode(value) + ' '
              }
              return text.trim()
            }

            return ''
          }

          let fullText = '';

          if (article.front?.['article-meta']?.['title-group']?.['article-title']) {
            const title = extractTextFromNode(article.front['article-meta']['title-group']['article-title']);
            fullText += `# ${title}\n\n`;
          }

          if (article.front?.['article-meta']?.abstract) {
            const abstract = extractTextFromNode(article.front['article-meta'].abstract);
            fullText += `## Abstract\n\n${abstract}\n\n`;
          }

          if (article.body) {
            // Try to extract structured content first
            const structuredContent = extractStructuredContent(article.body, extractTextFromNode);
            if (structuredContent) {
              fullText += `## Content\n\n${structuredContent}`;
            } else {
              // Fallback to basic text extraction
              const content = extractTextFromNode(article.body);
              fullText += `## Content\n\n${content}\n\n`;
            }
          }

          // Clean up text formatting
          fullText = fullText
            .replace(/[ \t]+/g, ' ')                    // Multiple spaces/tabs to single space
            .trim();

          // Assign the same full text to all related PMIDs and cache it
          for (const pmid of relatedPmids) {
            const existingLinks = resultsMap[pmid]?.links;
            resultsMap[pmid] = {
              pmid,
              fullText: fullText || null,
              ...(existingLinks && existingLinks.length > 0 && { links: existingLinks })
            };

            // Cache the full text if cache is enabled and fullText is not null
            if (cache && fullText) {
              try {
                await cache.setCachedFullText(pmid, fullText);
              } catch (err) {
                console.error('Error caching full text:', err);
              }
            }
          }
        } else {
          // No article found for this PMC ID
          relatedPmids.forEach(pmid => {
            const existingLinks = resultsMap[pmid]?.links;
            resultsMap[pmid] = {
              pmid,
              fullText: null,
              ...(existingLinks && existingLinks.length > 0 && { links: existingLinks })
            };
          });
        }
      } catch (error) {
        console.error(`Error fetching full text for PMC ID ${pmcId}:`, error);
        relatedPmids.forEach(pmid => {
          const existingLinks = resultsMap[pmid]?.links;
          resultsMap[pmid] = {
            pmid,
            fullText: null,
            ...(existingLinks && existingLinks.length > 0 && { links: existingLinks })
          };
        });
      }
    }

    // Combine cached and fetched results, maintaining the original order
    const allResults = [...cachedResults, ...Object.values(resultsMap)];
    return pmids.map(pmid => allResults.find(result => result.pmid === pmid)).filter(Boolean) as FullTextResult[];
  };

  return {
    search,
    fetchArticles,
    searchAndFetch,
    checkFullTextAvailability,
    getFullText
  };
}

