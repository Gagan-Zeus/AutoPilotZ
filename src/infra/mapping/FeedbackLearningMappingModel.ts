import { applyMappingFeedback } from '../../core/entities/FeedbackLearning';
import type { FieldMapping, MappingRequest } from '../../core/entities/Mapping';
import type { MappingModel } from '../../core/ports/MappingModel';
import type { FeedbackLearningRepository } from '../../core/ports/FeedbackLearningRepository';

export class FeedbackLearningMappingModel implements MappingModel {
  constructor(
    private readonly baseModel: MappingModel,
    private readonly repository: FeedbackLearningRepository,
  ) {}

  async mapFields(request: MappingRequest): Promise<FieldMapping[]> {
    const [baseMappings, feedback] = await Promise.all([
      this.baseModel.mapFields(request),
      this.repository.list(),
    ]);

    return applyMappingFeedback({
      fields: request.fields,
      mappings: baseMappings,
      feedback,
      profileAttributes: request.profileAttributes,
      minConfidence: request.minConfidence,
    });
  }
}
