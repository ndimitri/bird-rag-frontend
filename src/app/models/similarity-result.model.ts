export interface SimilaritySearchFilterRequest {
  query: string;
  filters?: Record<string, string | number>;
}

export interface SimilaritySearchFilterApiResult {
  code: string;
  name: string;
  description: string;
  domainId?: string;
  maintenanceAgencyId?: string;
  validFrom?: string;
  validTo?: string;
  validFromUnix?: number;
  validToUnix?: number;
  score: number;
}

export interface LegalDocumentSearchFilterRequest {
  query: string;
  filters?: Record<string, string | number>;
}

export interface LegalDocumentSearchApiResult {
  title: string;
  text: string;
  s3Uri: string;
  score: number;
  entityType?: string;
  documentType?: string;
  regulation?: string;
  article?: string;
  attachedVariable?: string;
  jurisdiction?: string;
  validFrom?: string;
  sourceUrl?: string;
  pageNumber?: number;
}

export interface LegalDocumentChunk {
  text: string;
  score: number;
  pageNumber?: number;
}

export interface LegalDocumentResult {
  id: string;
  title: string;
  text: string;
  s3Uri: string;
  score: number;
  entityType?: string;
  documentType?: string;
  regulation?: string;
  article?: string;
  attachedVariable?: string;
  jurisdiction?: string;
  validFrom?: string;
  sourceUrl?: string;
  pageNumber?: number;
  pageNumbers?: number[];
  chunkCount?: number;
  chunks?: LegalDocumentChunk[];
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
