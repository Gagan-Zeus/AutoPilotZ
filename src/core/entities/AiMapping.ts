import type { NormalizedFormField } from './FormExtraction';
import type { ProfileData, VaultProfile } from './Profile';

export type AiMappingProfile = ProfileData | VaultProfile;

export interface AiMappingRequest {
  profile: AiMappingProfile;
  fields: NormalizedFormField[];
  minConfidence?: number;
}

export interface AiFieldMapping {
  fieldId: string;
  profilePath: string;
  confidence: number;
  reasoning: string;
}

export type AiFieldMappingResult = AiFieldMapping | null;

export interface ProfilePathDescriptor {
  path: string;
  kind: 'string' | 'number' | 'boolean' | 'array' | 'object';
  populated: boolean;
}

export interface AiMappingBatchField {
  fieldId: string;
  type: string;
  label?: string;
  context: NormalizedFormField['context'];
  required: boolean;
  validationRules: NormalizedFormField['validationRules'];
  options: NormalizedFormField['options'];
}

export interface AiMappingBatchRequest {
  prompt: string;
  fields: AiMappingBatchField[];
  profilePaths: ProfilePathDescriptor[];
}

export interface AiMappingModelResult {
  fieldId: string;
  profilePath: string | null;
  confidence: number;
  reasoning: string;
}
