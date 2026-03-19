import {
  Component,
  OnDestroy,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';

import { SimilarityService } from '../similarity.service';
import { SimilarityResult } from '../models/similarity-result.model';
import {
  Constraint,
  DomainMember,
  FormData,
  GeneratedData,
  LegalReference,
} from '../models/attribute.model';

const DUMMY_LEGAL: LegalReference[] = [
  { id: 'gdpr-6', title: 'GDPR Article 6 - Lawfulness of Processing', source: 'GDPR', snippet: 'Processing shall be lawful only if and to the extent that at least one of the following applies...', confidence: 95, keywords: ['personal data', 'consent', 'legitimate interest'] },
  { id: 'gdpr-17', title: 'GDPR Article 17 - Right to Erasure', source: 'GDPR', snippet: 'The data subject shall have the right to obtain from the controller the erasure of personal data...', confidence: 82, keywords: ['erasure', 'deletion', 'right to be forgotten'] },
  { id: 'mifid-25', title: 'MiFID II Article 25 - Client Assessment', source: 'MiFID II', snippet: 'Investment firms shall ensure and demonstrate to competent authorities that natural persons giving investment advice...', confidence: 68, keywords: ['client data', 'assessment', 'suitability'] },
];

@Component({
  selector: 'app-add-attribute',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './add-attribute.html',
  styleUrl: './add-attribute.scss',
})
export class AddAttributeComponent implements OnDestroy {
  private readonly similarityService = inject(SimilarityService);
  private readonly descSearch$ = new Subject<string>();
  private readonly sub = new Subscription();

  formData: FormData = {
    maintenanceAgency: 'SDD team (ECB)',
    code: '', name: '', genericDescription: '', additionalDescription: '',
    role: '', logicalDataType: '', enumerated: false,
    subdomainCode: '', subdomainName: '', subdomainDescription: '', subdomainValueType: '',
  };

  addAnother = false;
  attrOpen = true;
  restrOpen = true;
  activeTab: 'subdomain' | 'variableset' = 'subdomain';

  similarResults = signal<SimilarityResult[]>([]);
  isLoadingSimilar = signal(false);
  aiActive = signal(false);

  constraints: Constraint[] = [];
  newConstraintType = '';
  newConstraintValue = '';

  members: DomainMember[] = [];
  showMemberModal = false;
  newMember = { code: '', name: '', description: '' };
  decomposeList: string[] = [];
  private decomposeTimer: any;

  showGenerateModal = false;
  isGenerating = false;
  generatedData: GeneratedData | null = null;
  wizardStep: 'generate' | 'legal' = 'generate';

  legalQuery = '';
  legalFilter = 'all';
  allLegal = DUMMY_LEGAL;
  filteredLegal = signal<LegalReference[]>(DUMMY_LEGAL);
  selectedLegalIds = signal<string[]>([]);
  linkedRefs: LegalReference[] = [];

  showConceptModal = false;

  constructor() {
    this.sub.add(
      this.descSearch$
        .pipe(
          debounceTime(600),
          distinctUntilChanged(),
          switchMap((query) => {
            this.isLoadingSimilar.set(true);
            return this.similarityService.search(query);
          })
        )
        .subscribe((results) => {
          this.similarResults.set(results);
          this.isLoadingSimilar.set(false);
        })
    );
  }

  ngOnDestroy(): void { this.sub.unsubscribe(); }

  onDescriptionChange(val: string): void {
    this.aiActive.set(val.length >= 10);
    if (val.length >= 10) {
      this.descSearch$.next(val);
    } else {
      this.similarResults.set([]);
      this.isLoadingSimilar.set(false);
    }
  }

  get remainingChars(): number { return Math.max(0, 10 - this.formData.genericDescription.length); }
  get shownResults(): SimilarityResult[] { return this.similarResults().slice(0, 3); }
  scorePercent(score: number): number { return Math.round(score * 100); }

  applyConcept(r: SimilarityResult, closeModal = false): void {
    const m = r.metadata;
    if (m['code']) this.formData.code = m['code'];
    if (m['name']) this.formData.name = m['name'];
    if (r.text) this.formData.genericDescription = r.text;
    if (m['role']) this.formData.role = m['role'];
    if (m['dataType']) this.formData.logicalDataType = m['dataType'];
    if (closeModal) this.showConceptModal = false;
  }

  addConstraint(): void {
    if (!this.newConstraintType || !this.newConstraintValue.trim()) return;
    this.constraints.push({ id: Date.now(), type: this.newConstraintType, value: this.newConstraintValue.trim() });
    this.newConstraintType = '';
    this.newConstraintValue = '';
  }

  removeConstraint(id: number): void { this.constraints = this.constraints.filter(c => c.id !== id); }

  openMemberModal(): void {
    this.newMember = { code: '', name: '', description: '' };
    this.decomposeList = [];
    this.showMemberModal = true;
  }

  onMemberDescChange(val: string): void {
    clearTimeout(this.decomposeTimer);
    if (val.length < 15) { this.decomposeList = []; return; }
    this.decomposeTimer = setTimeout(() => {
      const hasMultiple = val.includes(' and ') || val.includes(',') || val.includes(' & ');
      if (hasMultiple) {
        const parts = val.split(/,| and | & /).map(s => s.trim()).filter(s => s.length > 0);
        this.decomposeList = parts.length > 1 ? parts : [];
      } else { this.decomposeList = []; }
    }, 600);
  }

  addMember(): void {
    if (!this.newMember.code.trim() || !this.newMember.name.trim()) return;
    this.members.push({ ...this.newMember, id: Date.now() });
    this.showMemberModal = false;
  }

  splitMembers(): void {
    this.decomposeList.forEach((concept, i) => {
      const code = concept.split(' ').map(w => w.substring(0, 3).toUpperCase()).join('_');
      this.members.push({ id: Date.now() + i, code, name: concept, description: concept });
    });
    this.showMemberModal = false;
  }

  removeMember(id: number): void { this.members = this.members.filter(m => m.id !== id); }

  openGenerateModal(): void {
    this.wizardStep = 'generate';
    this.generatedData = null;
    this.selectedLegalIds.set([]);
    this.showGenerateModal = true;
    this.isGenerating = true;
    setTimeout(() => {
      this.generatedData = this.generateFromDescription(this.formData.genericDescription);
      this.isGenerating = false;
    }, 1400);
  }

  private generateFromDescription(desc: string): GeneratedData {
    const d = desc.toLowerCase();
    let code = 'ATTR_ITEM', name = 'Attribute Item', role = 'Attribute', dataType = 'String';
    if (d.includes('email')) { code = 'EMAIL_ADDR'; name = 'Email Address'; }
    else if (d.includes('phone')) { code = 'PHONE_NUM'; name = 'Phone Number'; }
    else if (d.includes('date')) { code = 'DATE_VAL'; name = 'Date Value'; dataType = 'Date'; }
    else if (d.includes('amount') || d.includes('price')) { code = 'AMT_VAL'; name = 'Amount Value'; dataType = 'Decimal'; role = 'Measure'; }
    else if (d.includes('id') || d.includes('identifier')) { code = 'UNIQ_ID'; name = 'Unique Identifier'; role = 'Identifier'; }
    else if (d.includes('country')) { code = 'CNTRY_CD'; name = 'Country Code'; role = 'Dimension'; }
    else {
      const words = desc.trim().split(' ').slice(0, 3);
      code = words.map(w => w.substring(0, 4).toUpperCase()).join('_');
      name = words.join(' ');
    }
    return { code, name, description: desc, role, dataType };
  }

  applyGenerated(): void {
    if (!this.generatedData) return;
    this.formData.code = this.generatedData.code;
    this.formData.name = this.generatedData.name;
    this.formData.role = this.generatedData.role;
    this.formData.logicalDataType = this.generatedData.dataType;
    const newRefs = this.allLegal.filter(r => this.selectedLegalIds().includes(r.id));
    newRefs.forEach(r => { if (!this.linkedRefs.find(lr => lr.id === r.id)) this.linkedRefs.push(r); });
    this.showGenerateModal = false;
  }

  removeLinkedRef(id: string): void { this.linkedRefs = this.linkedRefs.filter(r => r.id !== id); }

  goToLegal(): void {
    this.legalQuery = this.formData.genericDescription.substring(0, 50);
    this.wizardStep = 'legal';
    this.filterLegal();
  }

  filterLegal(): void {
    let results = this.allLegal;
    if (this.legalFilter !== 'all') results = results.filter(r => r.source === this.legalFilter);
    if (this.legalQuery) {
      const q = this.legalQuery.toLowerCase();
      results = results.filter(r =>
        r.title.toLowerCase().includes(q) ||
        r.snippet.toLowerCase().includes(q) ||
        r.keywords.some(k => k.includes(q))
      );
    }
    this.filteredLegal.set(results);
  }

  toggleLegalRef(id: string): void {
    const curr = this.selectedLegalIds();
    this.selectedLegalIds.set(curr.includes(id) ? curr.filter(x => x !== id) : [...curr, id]);
  }

  isLegalSelected(id: string): boolean { return this.selectedLegalIds().includes(id); }
  linkAndContinue(): void { this.wizardStep = 'generate'; }
}
