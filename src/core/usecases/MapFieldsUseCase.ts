import type { FieldMapping, MappingRequest } from '../entities/Mapping';
import type { MappingModel } from '../ports/MappingModel';

export class MapFieldsUseCase {
  constructor(
    private readonly deterministicModel: MappingModel,
    private readonly aiModel: MappingModel,
    private readonly aiFallbackThreshold = 0.9,
  ) {}

  async execute(request: MappingRequest): Promise<FieldMapping[]> {
    const aiMinConfidence = Math.max(request.minConfidence, this.aiFallbackThreshold);
    const deterministicMappings = await this.deterministicModel.mapFields({
      ...request,
      minConfidence: 0,
    });
    const deterministicBySelector = new Map(
      deterministicMappings.map((mapping) => [mapping.selector, mapping]),
    );
    const fieldsNeedingAi = request.fields.filter((field) => {
      const deterministicMapping = deterministicBySelector.get(field.selector);
      return !deterministicMapping || deterministicMapping.confidence < this.aiFallbackThreshold;
    });

    const aiMappings =
      fieldsNeedingAi.length > 0
        ? await this.aiModel.mapFields({
            ...request,
            fields: fieldsNeedingAi,
            minConfidence: aiMinConfidence,
          })
        : [];

    return this.mergeMappings(deterministicMappings, aiMappings).filter(
      (mapping) => mapping.confidence >= request.minConfidence,
    );
  }

  private mergeMappings(
    deterministicMappings: FieldMapping[],
    aiMappings: FieldMapping[],
  ): FieldMapping[] {
    const selected = new Map<string, FieldMapping>();
    for (const mapping of [...deterministicMappings, ...aiMappings]) {
      const existing = selected.get(mapping.selector);
      if (!existing || mapping.confidence > existing.confidence) {
        selected.set(mapping.selector, mapping);
      }
    }
    return [...selected.values()];
  }
}
