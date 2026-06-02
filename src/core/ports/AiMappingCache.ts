import type { AiFieldMappingResult } from '../entities/AiMapping';

export interface AiMappingCache {
  get(key: string): Promise<AiFieldMappingResult[] | undefined>;
  set(key: string, value: AiFieldMappingResult[]): Promise<void>;
}
