import { createPubMedAPI, PubMedOptions, FullTextResult } from '../pubmed-api.js';

export interface GetFullTextHandler {
  getFullText(pmids: string[]): Promise<FullTextResult[]>;
}

export function createGetFullTextHandler(pubmedOptions: PubMedOptions): GetFullTextHandler {
  const pubmedApi = createPubMedAPI(pubmedOptions);

  return {
    async getFullText(pmids: string[]): Promise<FullTextResult[]> {
      return await pubmedApi.getFullText(pmids);
    }
  };
}