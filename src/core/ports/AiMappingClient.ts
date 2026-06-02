import type { AiMappingBatchRequest, AiMappingModelResult } from '../entities/AiMapping';

export interface AiMappingClient {
  mapFields(request: AiMappingBatchRequest): Promise<AiMappingModelResult[]>;
}
