import type { NormalizedFormField } from './FormExtraction';

export type DomFieldSignal = NormalizedFormField;

export interface FieldMapping {
  selector: string;
  profileKey: string;
  confidence: number;
  reason: string;
}

export interface MappingRequest {
  fields: DomFieldSignal[];
  profileAttributes: Record<string, string | number | boolean>;
  minConfidence: number;
}
