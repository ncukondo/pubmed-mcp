import { createPubMedAPI, SearchOptions, PubMedOptions } from '../pubmed-api.js';

export interface SearchHandler {
  search: (query: string, searchOptions?: SearchOptions) => Promise<SearchResultItem[]>;
}

export interface SearchResultItem {
  pmid: string;
  title: string;
  pubDate: string;
}

export function createSearchHandler(pubmedOptions: PubMedOptions): SearchHandler {
  const pubmedApi = createPubMedAPI(pubmedOptions);

  return {
    async search(query: string, searchOptions?: SearchOptions): Promise<SearchResultItem[]> {
      const articles = await pubmedApi.searchAndFetch(query, searchOptions);
      
      return articles.map(article => ({
        pmid: article.pmid,
        title: article.title,
        pubDate: article.pubDate
      }));
    }
  };
}