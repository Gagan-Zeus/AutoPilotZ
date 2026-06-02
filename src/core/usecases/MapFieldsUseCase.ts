import type { FieldMapping, MappingRequest } from '../entities/Mapping';
import type { MappingModel } from '../ports/MappingModel';

export class MapFieldsUseCase {
  constructor(private readonly model: MappingModel) {}

  async execute(request: MappingRequest): Promise<FieldMapping[]> {
    const mappings = await this.model.mapFields(request);
    return mappings.filter((mapping) => mapping.confidence >= request.minConfidence);
  }
}
