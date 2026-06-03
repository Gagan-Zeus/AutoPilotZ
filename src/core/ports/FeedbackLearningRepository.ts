import type { LearnedMappingFeedback } from '../entities/FeedbackLearning';

export interface FeedbackLearningRepository {
  list(): Promise<LearnedMappingFeedback[]>;
  upsertMany(records: LearnedMappingFeedback[]): Promise<LearnedMappingFeedback[]>;
  clear(): Promise<void>;
}
