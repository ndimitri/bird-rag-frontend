export interface SimilaritySearchFilterRequest {
  query: string;
  filters?: Record<string, string>;
}

export interface SimilaritySearchFilterApiResult {
  code: string;
  name: string;
  description: string;
  domainId?: string;
  maintenanceAgencyId?: string;
  score: number;
}

export interface SimilarityResult {
  text: string;
  score: number;
  metadata: {
    source?: string;
    page?: number;
    section?: string;
    url?: string;
    author?: string;
    [key: string]: any;
  };
}
