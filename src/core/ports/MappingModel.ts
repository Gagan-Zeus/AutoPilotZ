import type { FieldMapping, MappingRequest } from '../entities/Mapping';

export interface MappingModel {
  mapFields(request: MappingRequest): Promise<FieldMapping[]>;
}
