import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import {
  SimilarityResult,
  SimilaritySearchFilterApiResult,
  SimilaritySearchFilterRequest,
} from './models/similarity-result.model';
import {
  GenerateAttributeRequest,
  GenerateAttributeResponse,
} from './models/attribute.model';

interface LegalDocumentSearchFilterRequest {
  query: string;
  filters?: Record<string, string | number>;
}

interface LegalDocumentSearchApiResult {
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
}

interface LegalDocumentResult {
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
}

@Injectable({ providedIn: 'root' })
export class SimilarityService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = 'http://localhost:8080/api/similarity/search/filter';
  private readonly legalApiUrl = 'http://localhost:8080/api/similarity/search/filter/legal-documents';
  private readonly aiGenerateUrl = 'http://localhost:8080/api/ai-generation/generate-attribute';

  search(query: string, filters?: Record<string, string | number>): Observable<SimilarityResult[]> {
    const hasFilters = !!filters && Object.keys(filters).length > 0;
    const payload: SimilaritySearchFilterRequest = hasFilters
      ? { query, filters }
      : { query };

    return this.http
      .post<SimilaritySearchFilterApiResult[]>(this.apiUrl, payload)
      .pipe(
        map((results) => results.map((item) => this.toUiResult(item))),
        catchError((err) => {
          console.warn('Similarity API unreachable, using fallback data', err);
          return of(this.fallbackData(query));
        })
      );
  }

  generateAttribute(partialDescription: string): Observable<GenerateAttributeResponse> {
    const payload: GenerateAttributeRequest = { partialDescription };
    return this.http.post<GenerateAttributeResponse>(this.aiGenerateUrl, payload);
  }

  searchLegalDocuments(query: string, filters?: Record<string, string | number>): Observable<LegalDocumentResult[]> {
    const hasFilters = !!filters && Object.keys(filters).length > 0;
    const payload: LegalDocumentSearchFilterRequest = hasFilters
      ? { query, filters }
      : { query };

    return this.http
      .post<LegalDocumentSearchApiResult[]>(this.legalApiUrl, payload)
      .pipe(
        map((results) => this.dedupeLegalDocuments(results.map((item) => this.toLegalDocumentResult(item)))),
        catchError((err) => {
          console.warn('Legal documents API unreachable, using fallback data', err);
          return of(this.fallbackLegalDocuments(query));
        })
      );
  }

  private toUiResult(item: SimilaritySearchFilterApiResult): SimilarityResult {
    return {
      text: item.description ?? '',
      score: item.score ?? 0,
      metadata: {
        code: item.code,
        name: item.name,
        title: item.name,
        domain_id: item.domainId,
        maintenanceAgencyId: item.maintenanceAgencyId,
        maintenance_agency: item.maintenanceAgencyId,
      },
    };
  }

  private toLegalDocumentResult(item: LegalDocumentSearchApiResult): LegalDocumentResult {
    const id = this.buildLegalDocumentId(item);

    return {
      id,
      title: item.title ?? 'Untitled legal document',
      text: item.text ?? '',
      s3Uri: item.s3Uri ?? '',
      score: item.score ?? 0,
      entityType: item.entityType,
      documentType: item.documentType,
      regulation: item.regulation,
      article: item.article,
      attachedVariable: item.attachedVariable,
      jurisdiction: item.jurisdiction,
      validFrom: item.validFrom,
      sourceUrl: item.sourceUrl,
    };
  }

  private buildLegalDocumentId(item: LegalDocumentSearchApiResult): string {
    const rawId = [item.s3Uri, item.title, item.article, item.regulation]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim())
      .join('|');

    return rawId || `legal-doc-${Math.random().toString(36).slice(2, 10)}`;
  }

  private dedupeLegalDocuments(results: LegalDocumentResult[]): LegalDocumentResult[] {
    const byKey = new Map<string, LegalDocumentResult>();

    for (const item of results) {
      const key = [item.s3Uri, item.title, item.article, item.regulation, item.sourceUrl]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map((value) => value.trim().toLowerCase())
        .join('|');

      const existing = byKey.get(key);
      if (!existing || item.score > existing.score) {
        byKey.set(key, item);
      }
    }

    return Array.from(byKey.values()).sort((a, b) => b.score - a.score);
  }

  private fallbackData(_query: string): SimilarityResult[] {
    return [
      {
        text: 'Total exposure amount for regulatory reporting under FINREP framework (F 04.01). Measure of total outstanding exposures.',
        score: 0.92,
        metadata: { source: 'finrep_framework.pdf', page: 12, section: 'Exposure Measures', code: 'FNRP_EXP_AMT', name: 'FINREP Exposure Amount', role: 'Measure', dataType: 'Decimal' },
      },
      {
        text: 'Institutional sector of the counterparty. Maintenance agency: SDD team - Reference dictionary (ECB). More generic Variable: Institutional sector (INSTTTNL_SCTR).',
        score: 0.74,
        metadata: { source: 'ecb_reference_dict.pdf', page: 5, section: 'Counterparty Classification', code: 'INSTTTNL_SCTR_CNTRPRTY', name: 'Institutional Sector of Counterparty', role: 'Dimension', dataType: 'String' },
      },
      {
        text: 'Indicator flag for non-performing loan classification under FINREP taxonomy as defined by EBA guidelines.',
        score: 0.68,
        metadata: { source: 'eba_guidelines.pdf', page: 22, section: 'NPL Classification', code: 'FNRP_NPL_IND', name: 'FINREP Non-Performing Loan Indicator', role: 'Dimension', dataType: 'Boolean' },
      },
    ];
  }

  private fallbackLegalDocuments(query: string): LegalDocumentResult[] {
    const normalizedQuery = query.trim().toLowerCase();
    const docs: LegalDocumentResult[] = [
      {
        id: 'cRR-article-153',
        title: 'CRR Article 153 - Risk Weighted Exposure Amounts',
        text: 'This article describes how risk weighted exposure amounts should be determined for exposures.',
        s3Uri: 's3://legal-docs/crr/article-153.pdf',
        score: 0.91,
        entityType: 'legal_document',
        documentType: 'regulation',
        regulation: 'CRR',
        article: '153',
        attachedVariable: 'ANNL_TRNVR',
        jurisdiction: 'EU',
        validFrom: '2013-01-01',
        sourceUrl: 'https://eur-lex.europa.eu/example-document',
      },
      {
        id: 'gdpr-article-6',
        title: 'GDPR Article 6 - Lawfulness of Processing',
        text: 'Processing shall be lawful only if and to the extent that at least one of the bases laid down applies.',
        s3Uri: 's3://legal-docs/gdpr/article-6.pdf',
        score: 0.74,
        entityType: 'legal_document',
        documentType: 'regulation',
        regulation: 'GDPR',
        article: '6',
        attachedVariable: 'PERSONAL_DATA_PROCESSING',
        jurisdiction: 'EU',
        validFrom: '2018-05-25',
        sourceUrl: 'https://eur-lex.europa.eu/example-gdpr',
      },
      {
        id: 'mifid-article-25',
        title: 'MiFID II Article 25 - Client Assessment',
        text: 'Investment firms shall assess whether the service is appropriate for the client.',
        s3Uri: 's3://legal-docs/mifid/article-25.pdf',
        score: 0.63,
        entityType: 'legal_document',
        documentType: 'directive',
        regulation: 'MiFID II',
        article: '25',
        attachedVariable: 'CLIENT_PROFILE',
        jurisdiction: 'EU',
        validFrom: '2014-08-01',
        sourceUrl: 'https://eur-lex.europa.eu/example-mifid',
      },
    ];

    if (!normalizedQuery) {
      return docs;
    }

    return docs.filter((doc) => {
      const haystack = [doc.title, doc.text, doc.regulation, doc.article, doc.attachedVariable, doc.jurisdiction]
        .filter((value): value is string => typeof value === 'string')
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }
}
