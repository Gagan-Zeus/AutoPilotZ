import type { LearnedMappingFeedback } from '../../core/entities/FeedbackLearning';
import { mergeLearnedFeedback } from '../../core/entities/FeedbackLearning';
import type { FeedbackLearningRepository } from '../../core/ports/FeedbackLearningRepository';
import type { StorageArea } from './ChromeStorageArea';

const FEEDBACK_KEY = 'autopilotx.mappingFeedback';
const MAX_FEEDBACK_RECORDS = 500;

export class ChromeFeedbackLearningRepository implements FeedbackLearningRepository {
  constructor(private readonly storage: StorageArea) {}

  async list(): Promise<LearnedMappingFeedback[]> {
    const values =
      await this.storage.get<Record<string, LearnedMappingFeedback[] | undefined>>(FEEDBACK_KEY);
    return values[FEEDBACK_KEY] ?? [];
  }

  async upsertMany(records: LearnedMappingFeedback[]): Promise<LearnedMappingFeedback[]> {
    const next = mergeLearnedFeedback(await this.list(), records, MAX_FEEDBACK_RECORDS);
    await this.storage.set({ [FEEDBACK_KEY]: next });
    return next;
  }

  async clear(): Promise<void> {
    await this.storage.remove(FEEDBACK_KEY);
  }
}
