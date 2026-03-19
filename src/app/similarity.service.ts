import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { SimilarityResult } from './models/similarity-result.model';

@Injectable({ providedIn: 'root' })
export class SimilarityService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = 'http://localhost:8080/api/similarity/search';

  search(query: string): Observable<SimilarityResult[]> {
    return this.http
      .get<SimilarityResult[]>(this.apiUrl, { params: { query } })
      .pipe(
        catchError((err) => {
          console.warn('Similarity API unreachable, using fallback data', err);
          return of(this.fallbackData(query));
        })
      );
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
