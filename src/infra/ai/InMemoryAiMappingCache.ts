import type { AiFieldMappingResult } from '../../core/entities/AiMapping';
import type { AiMappingCache } from '../../core/ports/AiMappingCache';

export class InMemoryAiMappingCache implements AiMappingCache {
  private readonly values = new Map<string, AiFieldMappingResult[]>();

  get(key: string): Promise<AiFieldMappingResult[] | undefined> {
    return Promise.resolve(this.values.get(key));
  }

  set(key: string, value: AiFieldMappingResult[]): Promise<void> {
    this.values.set(key, value);
    return Promise.resolve();
  }
}
