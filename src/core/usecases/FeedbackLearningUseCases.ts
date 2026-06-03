import {
  applyMappingFeedback,
  createLearnedMappingFeedback,
  type LearnedMappingFeedback,
  type MappingFeedbackInput,
} from '../entities/FeedbackLearning';
import type { FieldMapping, MappingRequest } from '../entities/Mapping';
import type { FeedbackLearningRepository } from '../ports/FeedbackLearningRepository';

export class RecordMappingFeedbackUseCase {
  constructor(private readonly repository: FeedbackLearningRepository) {}

  async execute(inputs: MappingFeedbackInput[]): Promise<LearnedMappingFeedback[]> {
    if (inputs.length === 0) {
      return this.repository.list();
    }

    return this.repository.upsertMany(
      inputs.slice(0, 100).map((input) => createLearnedMappingFeedback(input)),
    );
  }
}

export class ListMappingFeedbackUseCase {
  constructor(private readonly repository: FeedbackLearningRepository) {}

  execute(): Promise<LearnedMappingFeedback[]> {
    return this.repository.list();
  }
}

export class ClearMappingFeedbackUseCase {
  constructor(private readonly repository: FeedbackLearningRepository) {}

  execute(): Promise<void> {
    return this.repository.clear();
  }
}

export class ApplyMappingFeedbackUseCase {
  constructor(private readonly repository: FeedbackLearningRepository) {}

  async execute(
    request: Pick<MappingRequest, 'fields' | 'profileAttributes' | 'minConfidence'> & {
      mappings: FieldMapping[];
    },
  ): Promise<FieldMapping[]> {
    const feedback = await this.repository.list();
    return applyMappingFeedback({
      fields: request.fields,
      mappings: request.mappings,
      feedback,
      profileAttributes: request.profileAttributes,
      minConfidence: request.minConfidence,
    });
  }
}
