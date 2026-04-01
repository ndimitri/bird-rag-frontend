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

@Injectable({ providedIn: 'root' })
export class SimilarityService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = 'http://localhost:8080/api/similarity/search/filter';
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

  private fallbackData(query: string): SimilarityResult[] {
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
}
