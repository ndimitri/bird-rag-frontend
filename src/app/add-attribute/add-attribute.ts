import {
  Component,
  OnDestroy,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged, finalize, switchMap } from 'rxjs/operators';

import { SimilarityService } from '../similarity.service';
import { SimilarityResult } from '../models/similarity-result.model';
import {
  Constraint,
  DomainMember,
  FormData,
  GeneratedData,
  LegalReference,
  AiGeneratedMetadata,
  GenerateAttributeResponse,
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
  generationError: string | null = null;
  wizardStep: 'generate' | 'legal' = 'generate';

  legalQuery = '';
  legalFilter = 'all';
  allLegal = DUMMY_LEGAL;
  filteredLegal = signal<LegalReference[]>(DUMMY_LEGAL);
  selectedLegalIds = signal<string[]>([]);
  linkedRefs: LegalReference[] = [];

  showConceptModal = false;
  similarityFilters: Array<{ key: string; value: string }> = [];
  filterKeyOptions = ['CODE', 'MAINTENANCE_AGENCY_ID', 'DOMAIN_ID', 'NAME'];
  newSimilarityFilterKey = '';
  newSimilarityFilterValue = '';

  constructor() {
    this.sub.add(
      this.descSearch$
        .pipe(
          debounceTime(600),
          distinctUntilChanged(),
          switchMap((query) => {
            this.isLoadingSimilar.set(true);
            return this.similarityService.search(query, this.buildSimilarityFilters());
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
  scoreClass(score: number): string {
    if (!Number.isFinite(score)) return 'score-unknown';
    if (score < 0.3) return 'score-noise';
    if (score < 0.45) return 'score-possible';
    if (score < 0.6) return 'score-clear';
    if (score < 0.8) return 'score-very-strong';
    return 'score-suspicious';
  }

  applyConcept(r: SimilarityResult, closeModal = false): void {
    const m = r.metadata;
    if (m['code']) this.formData.code = m['code'];
    const conceptName = m['name'] ?? m['title'];
    if (typeof conceptName === 'string' && conceptName.trim()) {
      this.formData.name = conceptName.trim();
    }
    const maintenanceAgency = m['maintenance_agency'] ?? m['maintenanceAgency'] ?? m['maintenanceAgencyId'];
    if (typeof maintenanceAgency === 'string' && maintenanceAgency.trim()) {
      this.formData.maintenanceAgency = maintenanceAgency.trim();
    }
    if (r.text) this.formData.genericDescription = r.text;
    const roleFromEntityType = this.mapEntityTypeToRole(m['entity_type']);
    const normalizedRole = this.normalizeRole(m['role']);
    if (roleFromEntityType) {
      this.formData.role = roleFromEntityType;
    } else if (normalizedRole) {
      this.formData.role = normalizedRole;
    }
    if (m['dataType']) this.formData.logicalDataType = m['dataType'];
    if (closeModal) this.showConceptModal = false;
  }

  addSimilarityFilter(): void {
    const key = this.newSimilarityFilterKey.trim().toUpperCase();
    const value = this.newSimilarityFilterValue.trim();

    if (!key || !value) {
      return;
    }

    const existingIndex = this.similarityFilters.findIndex((f) => f.key === key);
    if (existingIndex >= 0) {
      this.similarityFilters[existingIndex] = { key, value };
    } else {
      this.similarityFilters.push({ key, value });
    }

    this.newSimilarityFilterValue = '';
    this.triggerSimilaritySearch();
  }

  removeSimilarityFilter(key: string): void {
    this.similarityFilters = this.similarityFilters.filter((f) => f.key !== key);
    this.triggerSimilaritySearch();
  }

  private triggerSimilaritySearch(): void {
    const description = this.formData.genericDescription.trim();
    if (description.length >= 10) {
      this.isLoadingSimilar.set(true);
      const requestSub = this.similarityService
        .search(description, this.buildSimilarityFilters())
        .pipe(finalize(() => this.isLoadingSimilar.set(false)))
        .subscribe((results) => {
          this.similarResults.set(results);
        });

      this.sub.add(requestSub);
      return;
    }

    this.similarResults.set([]);
    this.isLoadingSimilar.set(false);
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
    this.generationError = null;
    this.selectedLegalIds.set([]);
    this.showGenerateModal = true;
    this.requestGeneratedAttribute();
  }

  retryGenerate(): void {
    this.generatedData = null;
    this.generationError = null;
    this.requestGeneratedAttribute();
  }

  private requestGeneratedAttribute(): void {
    const description = this.formData.genericDescription.trim();
    if (!description) {
      this.generationError = 'Please provide a description before generating.';
      return;
    }

    this.isGenerating = true;
    const requestSub = this.similarityService
      .generateAttribute(description)
      .pipe(finalize(() => { this.isGenerating = false; }))
      .subscribe({
        next: (response) => {
          this.generatedData = this.mapGeneratedData(response, description);
        },
        error: (err: unknown) => {
          console.error('AI generation failed', err);
          this.generationError = 'Unable to generate attribute from AI service. Please try again.';
        },
      });

    this.sub.add(requestSub);
  }

  private mapGeneratedData(response: GenerateAttributeResponse, description: string): GeneratedData {
    const metadata = response?.metadata ?? {};
    const code = this.pickFirstString(metadata, ['code', 'id']) ?? this.fallbackCode(description);
    const name = this.pickFirstString(metadata, ['title', 'name']) ?? this.fallbackName(description);
    const generatedDescription = this.pickFirstString(metadata, ['description']) ?? description;
    const role =
      this.mapEntityTypeToRole(this.pickFirstString(metadata, ['entity_type', 'entityType'])) ??
      this.normalizeRole(this.pickFirstString(metadata, ['role'])) ??
      'Attribute';
    const dataType = this.pickFirstString(metadata, ['logical_data_type', 'logicalDataType', 'data_type', 'dataType', 'value_type', 'type']) ?? 'String';
    const maintenanceAgency = this.pickFirstString(metadata, ['maintenance_agency', 'maintenanceAgency']);
    const subdomainCode = this.pickFirstString(metadata, ['domain_id', 'subdomain_code', 'subdomainCode']);
    const subdomainName = this.pickFirstString(metadata, ['domain_name', 'domainName', 'subdomain_name', 'subdomainName']);
    const subdomainDescription = this.pickFirstString(metadata, ['domain_description', 'domainDescription', 'subdomain_description', 'subdomainDescription']);
    const subdomainValueType = this.pickFirstString(metadata, ['value_type', 'subdomain_value_type', 'subdomainValueType']);
    const enumerated = this.pickFirstBoolean(metadata, ['enumerated', 'is_enumerated', 'isEnumerated']);

    return {
      code,
      name,
      description: generatedDescription,
      role,
      dataType,
      maintenanceAgency,
      subdomainCode,
      subdomainName,
      subdomainDescription,
      subdomainValueType,
      enumerated,
    };
  }

  private pickFirstString(metadata: AiGeneratedMetadata, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = metadata[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return undefined;
  }

  private pickFirstBoolean(metadata: AiGeneratedMetadata, keys: string[]): boolean | undefined {
    for (const key of keys) {
      const value = metadata[key];
      if (typeof value === 'boolean') {
        return value;
      }
    }
    return undefined;
  }

  private buildSimilarityFilters(): Record<string, string> | undefined {
    const filters: Record<string, string> = {};

    for (const filter of this.similarityFilters) {
      const key = filter.key.trim().toUpperCase();
      const value = filter.value.trim();
      if (key && value) {
        filters[key] = value;
      }
    }

    return Object.keys(filters).length > 0 ? filters : undefined;
  }

  private mapEntityTypeToRole(entityType: unknown): string | undefined {
    if (typeof entityType !== 'string' || !entityType.trim()) {
      return undefined;
    }

    const normalized = entityType
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replaceAll(/[\u0300-\u036f]/g, '')
      .replaceAll(/[_-]/g, ' ');

    if (normalized === 'variable' || normalized === 'attribut' || normalized === 'attribute') {
      return 'Attribute';
    }

    return this.normalizeRole(entityType);
  }

  private normalizeRole(role: unknown): string | undefined {
    if (typeof role !== 'string' || !role.trim()) {
      return undefined;
    }

    const normalized = role.trim().toLowerCase();
    const roleMap: Record<string, string> = {
      attribute: 'Attribute',
      attribut: 'Attribute',
      variable: 'Attribute',
      identifier: 'Identifier',
      measure: 'Measure',
      dimension: 'Dimension',
    };

    return roleMap[normalized];
  }

  private fallbackCode(desc: string): string {
    const tokens = desc
      .trim()
      .split(/\s+/)
      .slice(0, 4)
      .map((word) => word.replaceAll(/[^a-zA-Z0-9]/g, '').toUpperCase())
      .filter((word) => word.length > 0)
      .map((word) => word.slice(0, 6));

    return tokens.length > 0 ? tokens.join('_') : 'ATTR_ITEM';
  }

  private fallbackName(desc: string): string {
    const cleaned = desc.trim();
    if (!cleaned) {
      return 'Attribute Item';
    }

    return cleaned
      .split(/\s+/)
      .slice(0, 5)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  applyGenerated(): void {
    if (!this.generatedData) return;
    this.formData.code = this.generatedData.code;
    this.formData.name = this.generatedData.name;
    this.formData.genericDescription = this.generatedData.description;
    this.formData.role = this.generatedData.role;
    this.formData.logicalDataType = this.generatedData.dataType;
    if (this.generatedData.maintenanceAgency) {
      this.formData.maintenanceAgency = this.generatedData.maintenanceAgency;
    }
    if (this.generatedData.subdomainCode) {
      this.formData.subdomainCode = this.generatedData.subdomainCode;
    }
    if (this.generatedData.subdomainName) {
      this.formData.subdomainName = this.generatedData.subdomainName;
    }
    if (this.generatedData.subdomainDescription) {
      this.formData.subdomainDescription = this.generatedData.subdomainDescription;
    }
    if (this.generatedData.subdomainValueType) {
      this.formData.subdomainValueType = this.generatedData.subdomainValueType;
    }
    if (typeof this.generatedData.enumerated === 'boolean') {
      this.formData.enumerated = this.generatedData.enumerated;
    }
    const newRefs = this.allLegal.filter(r => this.selectedLegalIds().includes(r.id));
    newRefs.forEach(r => { if (!this.linkedRefs.some(lr => lr.id === r.id)) this.linkedRefs.push(r); });
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
