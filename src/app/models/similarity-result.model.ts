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
