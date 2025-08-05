/**
 * PubMed API utility using NCBI E-utilities
 * Based on https://www.ncbi.nlm.nih.gov/books/NBK25499/
 */

import { XMLParser } from 'fast-xml-parser';
import { promises as fs } from 'fs';
import { join } from 'path';

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
}

export interface PubMedAPI {
  search: (query: string, options?: SearchOptions) => Promise<SearchResult>;
  fetchArticles: (pmids: string[]) => Promise<Article[]>;
  searchAndFetch: (query: string, options?: SearchAndFetchOptions) => Promise<Article[]>;
  checkFullTextAvailability: (pmid: string) => Promise<{ hasFullText: boolean; pmcId?: string }>;
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
          await fs.unlink(filePath).catch(() => {});
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
          await fs.unlink(filePath).catch(() => {});
          return null;
        }
        
        const timestamp = parseInt(timestampMatch[1]);
        if (isCacheEntryValid(timestamp)) {
          // Return content without the timestamp line
          return lines.slice(1).join('\n').trim();
        } else {
          // Cache expired, remove the file
          await fs.unlink(filePath).catch(() => {});
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

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const makeRequest = async (url: string): Promise<any> => {
    // Rate limiting: 3 requests per second without API key, 10 with API key
    const delayMs = apiKey ? 100 : 334;
    await delay(delayMs);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.text();
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

  const fetchArticles = async (pmids: string[]): Promise<Article[]> => {
    if (pmids.length === 0) return [];

    // Check cache for existing articles if cache is enabled
    const cachedArticles: Article[] = [];
    const uncachedPmids: string[] = [];

    if (cache) {
      for (const pmid of pmids) {
        const cached = await cache.getCachedSummary(pmid);
        if (cached) {
          cachedArticles.push(cached);
        } else {
          uncachedPmids.push(pmid);
        }
      }
    } else {
      uncachedPmids.push(...pmids);
    }

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
      const abstract = abstractText ? String(abstractText?.['#text'] || abstractText) : undefined;
      
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

  const checkFullTextAvailability = async (pmid: string): Promise<{ hasFullText: boolean; pmcId?: string }> => {
    const params = {
      dbfrom: 'pubmed',
      db: 'pmc',
      id: pmid,
      linkname: 'pubmed_pmc'
    };

    const url = buildUrl('elink', params);
    
    try {
      const xmlResponse = await makeRequest(url);
      const parsedData = parser.parse(xmlResponse);
      
      const linkSets = parsedData.eLinkResult?.LinkSet;
      if (!linkSets) {
        return { hasFullText: false };
      }
      
      const linkSet = Array.isArray(linkSets) ? linkSets[0] : linkSets;
      const linkSetDbs = linkSet.LinkSetDb;
      
      if (!linkSetDbs) {
        return { hasFullText: false };
      }
      
      const linkSetDb = Array.isArray(linkSetDbs) ? linkSetDbs[0] : linkSetDbs;
      const links = linkSetDb.Link;
      
      if (!links) {
        return { hasFullText: false };
      }
      
      const linkArray = Array.isArray(links) ? links : [links];
      const pmcId = linkArray[0]?.Id;
      
      if (pmcId) {
        return { hasFullText: true, pmcId: String(pmcId) };
      }
      
      return { hasFullText: false };
    } catch (error) {
      console.error('Error checking full text availability:', error);
      return { hasFullText: false };
    }
  };


  const checkFullTextAvailabilityBatch = async (pmids: string[]): Promise<{ [pmid: string]: { hasFullText: boolean; pmcId?: string } }> => {
    if (pmids.length === 0) return {};

    try {
      const params = {
        dbfrom: 'pubmed',
        db: 'pmc',
        id: pmids.join(','),
        linkname: 'pubmed_pmc',
        retmode: 'xml'
      };

      const url = buildUrl('elink', params);
      const xmlResponse = await makeRequest(url);
      const parsedData = parser.parse(xmlResponse);

      const results: { [pmid: string]: { hasFullText: boolean; pmcId?: string } } = {};
      
      // Initialize all PMIDs as not having full text
      pmids.forEach(pmid => {
        results[pmid] = { hasFullText: false };
      });

      const linkSets = parsedData.eLinkResult?.LinkSet;
      if (linkSets) {
        const linkSetsArray = Array.isArray(linkSets) ? linkSets : [linkSets];
        
        linkSetsArray.forEach((linkSet: any) => {
          const fromPmid = String(linkSet.IdList?.Id?.['#text'] || linkSet.IdList?.Id || '');
          const links = linkSet.LinkSetDb?.Link;
          
          if (links && fromPmid) {
            const linksArray = Array.isArray(links) ? links : [links];
            if (linksArray.length > 0) {
              const pmcId = String(linksArray[0].Id?.['#text'] || linksArray[0].Id || '');
              if (pmcId) {
                results[fromPmid] = { hasFullText: true, pmcId };
              }
            }
          }
        });
      }

      return results;
    } catch (error) {
      console.error('Error checking full text availability (batch):', error);
      const results: { [pmid: string]: { hasFullText: boolean; pmcId?: string } } = {};
      pmids.forEach(pmid => {
        results[pmid] = { hasFullText: false };
      });
      return results;
    }
  };

  const getFullText = async (pmids: string[]): Promise<FullTextResult[]> => {
    if (pmids.length === 0) return [];

    // Check cache for existing full texts if cache is enabled
    const cachedResults: FullTextResult[] = [];
    const uncachedPmids: string[] = [];

    if (cache) {
      for (const pmid of pmids) {
        const cached = await cache.getCachedFullText(pmid);
        if (cached !== null) {
          cachedResults.push({ pmid, fullText: cached });
        } else {
          uncachedPmids.push(pmid);
        }
      }
    } else {
      uncachedPmids.push(...pmids);
    }

    // If all full texts are cached, return them
    if (uncachedPmids.length === 0) {
      return cachedResults;
    }

    // Batch check full text availability for uncached PMIDs
    const availabilityResults = await checkFullTextAvailabilityBatch(uncachedPmids);
    
    // Group PMIDs by their PMC IDs for batch fetching
    const pmcToPmidMap: { [pmcId: string]: string[] } = {};
    const resultsMap: { [pmid: string]: FullTextResult } = {};
    
    // Initialize results and group by PMC ID
    uncachedPmids.forEach(pmid => {
      const availability = availabilityResults[pmid];
      if (availability.hasFullText && availability.pmcId) {
        if (!pmcToPmidMap[availability.pmcId]) {
          pmcToPmidMap[availability.pmcId] = [];
        }
        pmcToPmidMap[availability.pmcId].push(pmid);
      } else {
        resultsMap[pmid] = { pmid, fullText: null };
      }
    });

    // Batch fetch full texts for PMC IDs
    for (const [pmcId, relatedPmids] of Object.entries(pmcToPmidMap)) {
      try {
        const params = {
          db: 'pmc',
          id: pmcId,
          retmode: 'xml',
          rettype: 'full'
        };
        
        const url = buildUrl('efetch', params);
        const xmlResponse = await makeRequest(url);
        const parsedData = parser.parse(xmlResponse);
        
        const article = parsedData['pmc-articleset']?.article || parsedData.pmc_articleset?.article || parsedData.article;
        
        if (article) {
          const extractTextFromNode = (node: unknown): string => {
            if (node == null) return ''

            if (typeof node === 'string') {
              return node
            }

            if (Array.isArray(node)) {
              return node
                .map(extractTextFromNode)
                .filter(text => text.length > 0)
                .join(' ')
            }

            if (typeof node === 'object') {
              const obj = node as Record<string, unknown>
              const textValue = obj['#text']
              if (typeof textValue === 'string') {
                return textValue
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
            const content = extractTextFromNode(article.body);
            fullText += `## Content\n\n${content}\n\n`;
          }
          
          fullText = fullText
            .replace(/[ \t]+/g, ' ')
            .replace(/\n\s*\n/g, '\n\n')
            .trim();

          // Assign the same full text to all related PMIDs and cache it
          for (const pmid of relatedPmids) {
            resultsMap[pmid] = { pmid, fullText: fullText || null };
            
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
            resultsMap[pmid] = { pmid, fullText: null };
          });
        }
      } catch (error) {
        console.error(`Error fetching full text for PMC ID ${pmcId}:`, error);
        relatedPmids.forEach(pmid => {
          resultsMap[pmid] = { pmid, fullText: null };
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

