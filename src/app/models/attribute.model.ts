export interface FormData {
  maintenanceAgency: string;
  code: string;
  name: string;
  genericDescription: string;
  additionalDescription: string;
  role: string;
  logicalDataType: string;
  enumerated: boolean;
  subdomainCode: string;
  subdomainName: string;
  subdomainDescription: string;
  subdomainValueType: string;
}

export interface Constraint {
  id: number;
  type: string;
  value: string;
}

export interface DomainMember {
  id: number;
  code: string;
  name: string;
  description: string;
}

export interface LegalReference {
  id: string;
  title: string;
  source: string;
  snippet: string;
  confidence: number;
  keywords: string[];
}

export interface GeneratedData {
  code: string;
  name: string;
  description: string;
  role: string;
  dataType: string;
}
