import {
  Component,
  OnDestroy,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, finalize, switchMap } from 'rxjs/operators';

import { SimilarityService } from '../similarity.service';
import { SimilarityResult } from '../models/similarity-result.model';
import {
  Constraint,
  DomainMember,
  FormData,
  GeneratedData,
  AiGeneratedMetadata,
  GenerateAttributeResponse,
} from '../models/attribute.model';
import { LegalDocumentResult } from '../models/similarity-result.model';

type SimilarityDateOperator = '<' | '>' | '=' | '>=' | '<=';

interface LegalFilterOption {
  key: string;
  label: string;
  kind: 'text';
}

interface LegalFilterItem {
  key: string;
  value: string | number;
  displayValue: string;
}

interface SimilarityFilterOption {
  key: string;
  label: string;
  kind: 'text' | 'date';
}

interface SimilarityFilterItem {
  key: string;
  value: string | number;
  displayValue: string;
}

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
  private readonly legalSearch$ = new Subject<void>();
  private readonly sub = new Subscription();
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

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
  legalOrigin: 'generate' | 'form' = 'generate';

  legalQuery = '';
  readonly legalResultsDisplayCount = 5;
  showAllLegalResults = false;
  allLegal: LegalDocumentResult[] = [];
  filteredLegal = signal<LegalDocumentResult[]>([]);
  selectedLegalIds = signal<string[]>([]);
  linkedRefs: LegalDocumentResult[] = [];
  isLoadingLegalDocuments = signal(false);
  toastVisible = signal(false);
  toastMessage = signal('');
  legalFilters: LegalFilterItem[] = [];
  legalFilterKeyOptions: LegalFilterOption[] = [
    { key: 'article', label: 'Article', kind: 'text' },
    { key: 'document_type', label: 'Document type', kind: 'text' },
    { key: 'regulation', label: 'Regulation', kind: 'text' },
    { key: 'attached_variable', label: 'Attached variable', kind: 'text' },
    { key: 'jurisdiction', label: 'Jurisdiction', kind: 'text' },
    { key: 'entity_type', label: 'Entity type', kind: 'text' },
    { key: 'source_url', label: 'Source URL', kind: 'text' },
    { key: 'valid_from', label: 'Valid from', kind: 'text' },
  ];
  newLegalFilterKey = '';
  newLegalFilterValue = '';

  showConceptModal = false;
  similarityFilters: SimilarityFilterItem[] = [];
  filterKeyOptions: SimilarityFilterOption[] = [
    { key: 'CODE', label: 'Code', kind: 'text' },
    { key: 'MAINTENANCE_AGENCY_ID', label: 'Maintenance agency', kind: 'text' },
    { key: 'DOMAIN_ID', label: 'Domain', kind: 'text' },
    { key: 'NAME', label: 'Name', kind: 'text' },
    { key: 'VALID_FROM_UNIX', label: 'Valid from (date)', kind: 'date' },
    { key: 'VALID_TO_UNIX', label: 'Valid to (date)', kind: 'date' },
  ];
  dateFilterOperators: SimilarityDateOperator[] = ['<', '>', '=', '>=', '<='];
  newSimilarityFilterKey = '';
  newSimilarityFilterValue = '';
  newSimilarityFilterDate = '';
  newSimilarityDateOperator: SimilarityDateOperator = '>=';

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

    this.sub.add(
      this.legalSearch$
        .pipe(
          debounceTime(450),
          switchMap(() => {
            const query = this.buildLegalQuery();
            if (!query) {
              this.allLegal = [];
              this.filteredLegal.set([]);
              this.isLoadingLegalDocuments.set(false);
              return of([] as LegalDocumentResult[]);
            }

            this.isLoadingLegalDocuments.set(true);
            return this.similarityService
              .searchLegalDocuments(query, this.buildLegalFilters())
              .pipe(finalize(() => this.isLoadingLegalDocuments.set(false)));
          })
        )
        .subscribe((results) => {
          this.allLegal = results;
          this.filteredLegal.set(results);
        })
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
  }

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
  get shownLegalResults(): LegalDocumentResult[] {
    const results = this.filteredLegal();
    return this.showAllLegalResults ? results : results.slice(0, this.legalResultsDisplayCount);
  }
  get hasMoreLegalResults(): boolean {
    return this.filteredLegal().length > this.legalResultsDisplayCount;
  }
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

  isDateFilterKey(key: string): boolean {
    const normalized = key.trim().toUpperCase();
    return normalized === 'VALID_FROM_UNIX' || normalized === 'VALID_TO_UNIX';
  }

  addSimilarityFilter(): void {
    const key = this.newSimilarityFilterKey.trim().toUpperCase();
    if (!key) {
      return;
    }

    let filterValue: string | number;
    let displayValue = '';

    if (this.isDateFilterKey(key)) {
      const date = this.newSimilarityFilterDate.trim();
      const operator = this.newSimilarityDateOperator;
      const unixTimestamp = this.dateToUnixTimestamp(date);
      if (!date || unixTimestamp === null) {
        return;
      }

      filterValue = operator === '=' ? unixTimestamp : `${operator}${unixTimestamp}`;
      displayValue = `${operator} ${date}`;
    } else {
      const value = this.newSimilarityFilterValue.trim();
      if (!value) {
        return;
      }

      filterValue = value;
      displayValue = value;
    }

    const existingIndex = this.similarityFilters.findIndex((f) => f.key === key);
    if (existingIndex >= 0) {
      this.similarityFilters[existingIndex] = { key, value: filterValue, displayValue };
    } else {
      this.similarityFilters.push({ key, value: filterValue, displayValue });
    }

    this.newSimilarityFilterValue = '';
    this.newSimilarityFilterDate = '';
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
    this.legalOrigin = 'generate';
    this.wizardStep = 'generate';
    this.generatedData = null;
    this.generationError = null;
    this.selectedLegalIds.set([]);
    this.legalQuery = '';
    this.showAllLegalResults = false;
    this.legalFilters = [];
    this.newLegalFilterKey = '';
    this.newLegalFilterValue = '';
    this.allLegal = [];
    this.filteredLegal.set([]);
    this.linkedRefs = [];
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
          this.prepareLegalSearch();
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

  private buildSimilarityFilters(): Record<string, string | number> | undefined {
    const filters: Record<string, string | number> = {};

    for (const filter of this.similarityFilters) {
      const key = filter.key.trim().toUpperCase();
      const value = filter.value;
      const hasStringValue = typeof value === 'string' && value.trim().length > 0;
      const hasNumberValue = typeof value === 'number' && Number.isFinite(value);

      if (key && (hasStringValue || hasNumberValue)) {
        filters[key] = value;
      }
    }

    return Object.keys(filters).length > 0 ? filters : undefined;
  }

  private dateToUnixTimestamp(dateValue: string): number | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
    if (!match) {
      return null;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
      return null;
    }

    const unixSeconds = Math.floor(Date.UTC(year, month - 1, day) / 1000);
    return Number.isFinite(unixSeconds) ? unixSeconds : null;
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
    const linkedCount = this.attachSelectedLegalDocuments();
    if (linkedCount > 0) {
      this.showLinkToast(linkedCount);
    }
    this.showGenerateModal = false;
  }

  removeLinkedRef(id: string): void { this.linkedRefs = this.linkedRefs.filter(r => r.id !== id); }

  goToLegal(): void {
    this.legalOrigin = 'generate';
    this.showAllLegalResults = false;
    this.legalQuery = this.buildLegalQuery();
    this.wizardStep = 'legal';
    this.triggerLegalSearch();
  }

  openLegalReferencesFromForm(): void {
    this.legalOrigin = 'form';
    this.selectedLegalIds.set([]);
    this.showAllLegalResults = false;
    this.wizardStep = 'legal';
    this.showGenerateModal = true;
    this.legalQuery = `${this.formData.name} ${this.formData.genericDescription}`.trim();
    this.triggerLegalSearch();
  }

  onLegalQueryChange(value: string): void {
    this.legalQuery = value;
    this.showAllLegalResults = false;
    this.triggerLegalSearch();
  }

  addLegalFilter(): void {
    const key = this.newLegalFilterKey.trim();
    const value = this.newLegalFilterValue.trim();

    if (!key || !value) {
      return;
    }

    const existingIndex = this.legalFilters.findIndex((filter) => filter.key === key);
    const nextFilter: LegalFilterItem = {
      key,
      value,
      displayValue: value,
    };

    if (existingIndex >= 0) {
      this.legalFilters[existingIndex] = nextFilter;
    } else {
      this.legalFilters.push(nextFilter);
    }

    this.newLegalFilterKey = '';
    this.newLegalFilterValue = '';
    this.showAllLegalResults = false;
    this.triggerLegalSearch();
  }

  removeLegalFilter(key: string): void {
    this.legalFilters = this.legalFilters.filter((filter) => filter.key !== key);
    this.showAllLegalResults = false;
    this.triggerLegalSearch();
  }

  toggleLegalResultsExpansion(): void {
    this.showAllLegalResults = !this.showAllLegalResults;
  }

  toggleLegalRef(id: string): void {
    if (this.isLegalAlreadyLinked(id)) {
      return;
    }

    const curr = this.selectedLegalIds();
    this.selectedLegalIds.set(curr.includes(id) ? curr.filter(x => x !== id) : [...curr, id]);
  }

  isLegalSelected(id: string): boolean { return this.selectedLegalIds().includes(id); }

  isLegalAlreadyLinked(id: string): boolean {
    return this.linkedRefs.some((ref) => ref.id === id);
  }

  linkAndContinue(): void {
    const linkedCount = this.attachSelectedLegalDocuments();
    if (linkedCount > 0) {
      this.showLinkToast(linkedCount);
    }

    if (this.legalOrigin === 'form') {
      this.showGenerateModal = false;
      return;
    }

    this.wizardStep = 'generate';
  }

  private prepareLegalSearch(): void {
    const query = this.buildLegalQuery();
    if (!query) {
      return;
    }

    this.legalQuery = query;
    this.triggerLegalSearch();
  }

  private triggerLegalSearch(): void {
    this.legalSearch$.next();
  }

  private buildLegalQuery(): string {
    const typedQuery = this.legalQuery.trim();
    if (typedQuery.length > 0) {
      return typedQuery;
    }

    const generatedName = this.generatedData?.name?.trim() ?? this.formData.name.trim();
    const generatedDescription = this.generatedData?.description?.trim() ?? this.formData.genericDescription.trim();
    return [generatedName, generatedDescription].filter((value) => value.length > 0).join(' ').trim();
  }

  private buildLegalFilters(): Record<string, string | number> | undefined {
    const filters: Record<string, string | number> = {};

    for (const filter of this.legalFilters) {
      const key = filter.key.trim();
      const value = filter.value;
      const hasStringValue = typeof value === 'string' && value.trim().length > 0;
      const hasNumberValue = typeof value === 'number' && Number.isFinite(value);

      if (key && (hasStringValue || hasNumberValue)) {
        filters[key] = value;
      }
    }

    return Object.keys(filters).length > 0 ? filters : undefined;
  }

  private attachSelectedLegalDocuments(): number {
    const selected = this.allLegal.filter(
      (doc) => this.selectedLegalIds().includes(doc.id) && !this.isLegalAlreadyLinked(doc.id)
    );

    let linkedCount = 0;
    for (const doc of selected) {
      if (!this.linkedRefs.some((linked) => linked.id === doc.id)) {
        this.linkedRefs.push(doc);
        linkedCount += 1;
      }
    }

    // Nettoie les sélections après liaison pour éviter les états incohérents dans la modale.
    this.selectedLegalIds.set([]);
    return linkedCount;
  }

  private showLinkToast(linkedCount: number): void {
    const label = linkedCount > 1 ? 'references linked' : 'reference linked';
    this.toastMessage.set(`${linkedCount} ${label}`);
    this.toastVisible.set(true);

    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }

    this.toastTimer = setTimeout(() => {
      this.toastVisible.set(false);
    }, 2500);
  }
}

