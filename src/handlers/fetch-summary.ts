import { createPubMedAPI, PubMedOptions, Article } from '../pubmed-api.js';

export function createFetchSummaryHandler(pubmedOptions: PubMedOptions) {
  const pubmedApi = createPubMedAPI(pubmedOptions);

  return {
    async fetchSummary(pmids: string[]): Promise<Article[]> {
      return await pubmedApi.fetchArticles(pmids);
    }
  };
}