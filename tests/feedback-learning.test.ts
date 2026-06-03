import { describe, expect, it } from 'vitest';
import {
  applyMappingFeedback,
  createLearnedMappingFeedback,
  fieldLearningFingerprint,
  mergeLearnedFeedback,
} from '../src/core/entities/FeedbackLearning';
import type { StorageArea } from '../src/infra/chrome/ChromeStorageArea';
import { ChromeFeedbackLearningRepository } from '../src/infra/chrome/ChromeFeedbackLearningRepository';
import { FeedbackLearningMappingModel } from '../src/infra/mapping/FeedbackLearningMappingModel';
import type { FieldMapping, MappingRequest } from '../src/core/entities/Mapping';
import type { MappingModel } from '../src/core/ports/MappingModel';
import { field } from './field-test-utils';

class InMemoryStorageArea implements StorageArea {
  values: Record<string, unknown> = {};

  get<T>(keys?: string | string[] | Record<string, unknown> | null): Promise<T> {
    if (typeof keys === 'string') {
      return Promise.resolve({ [keys]: this.values[keys] } as T);
    }
    return Promise.resolve(this.values as T);
  }

  set(items: Record<string, unknown>): Promise<void> {
    this.values = { ...this.values, ...items };
    return Promise.resolve();
  }

  remove(keys: string | string[]): Promise<void> {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      delete this.values[key];
    }
    return Promise.resolve();
  }
}

class FakeMappingModel implements MappingModel {
  constructor(private readonly mappings: FieldMapping[]) {}

  mapFields(request: MappingRequest): Promise<FieldMapping[]> {
    const selectors = new Set(request.fields.map((candidate) => candidate.selector));
    return Promise.resolve(this.mappings.filter((mapping) => selectors.has(mapping.selector)));
  }
}

describe('feedback learning', () => {
  it('uses stable field fingerprints for equivalent field signals', () => {
    expect(fieldLearningFingerprint(field({ selector: '#email', label: 'Email' }))).toBe(
      fieldLearningFingerprint(field({ selector: '#different', label: 'Email' })),
    );
  });

  it('adds accepted mappings from local feedback', () => {
    const email = field({ selector: '#email', label: 'Email address' });
    const feedback = [
      createLearnedMappingFeedback({
        kind: 'accepted',
        field: email,
        selector: '#email',
        profileKey: 'email',
        confidence: 0.86,
      }),
    ];

    const result = applyMappingFeedback({
      fields: [email],
      mappings: [],
      feedback,
      profileAttributes: { email: 'ada@example.com' },
      minConfidence: 0,
    });

    expect(result).toEqual([
      expect.objectContaining({
        selector: '#email',
        profileKey: 'email',
        confidence: 0.97,
        reason: 'Local feedback match.',
      }),
    ]);
  });

  it('suppresses rejected mappings and applies overrides', () => {
    const name = field({ selector: '#name', label: 'Name' });
    const rejected = createLearnedMappingFeedback(
      {
        kind: 'rejected',
        field: name,
        selector: '#name',
        profileKey: 'preferredName',
        confidence: 0.9,
      },
      new Date('2026-01-01T00:00:00.000Z'),
    );
    const override = createLearnedMappingFeedback(
      {
        kind: 'override',
        field: name,
        selector: '#name',
        profileKey: 'firstName',
        originalProfileKey: 'preferredName',
        confidence: 0.9,
      },
      new Date('2026-01-02T00:00:00.000Z'),
    );

    const result = applyMappingFeedback({
      fields: [name],
      mappings: [
        {
          selector: '#name',
          profileKey: 'preferredName',
          confidence: 0.92,
          reason: 'AI',
        },
      ],
      feedback: [rejected, override],
      profileAttributes: { firstName: 'Ada', preferredName: 'Countess' },
      minConfidence: 0,
    });

    expect(result).toEqual([
      expect.objectContaining({
        selector: '#name',
        profileKey: 'firstName',
        confidence: 0.995,
        reason: 'Local feedback override.',
      }),
    ]);
  });

  it('merges records locally and increments repeat feedback counts', () => {
    const email = field({ selector: '#email', label: 'Email' });
    const first = createLearnedMappingFeedback({
      kind: 'accepted',
      field: email,
      selector: '#email',
      profileKey: 'email',
      confidence: 0.8,
    });
    const second = createLearnedMappingFeedback({
      kind: 'accepted',
      field: email,
      selector: '#email',
      profileKey: 'email',
      confidence: 0.95,
    });

    const merged = mergeLearnedFeedback([first], [second]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.count).toBe(2);
    expect(merged[0]?.confidence).toBe(0.95);
  });

  it('persists feedback through chrome local storage only', async () => {
    const storage = new InMemoryStorageArea();
    const repository = new ChromeFeedbackLearningRepository(storage);
    const feedback = createLearnedMappingFeedback({
      kind: 'rejected',
      field: field({ selector: '#ssn', label: 'SSN' }),
      selector: '#ssn',
      profileKey: 'ssn',
      confidence: 0.7,
    });

    await repository.upsertMany([feedback]);

    expect(await repository.list()).toEqual([feedback]);
    expect(Object.keys(storage.values)).toEqual(['autopilotx.mappingFeedback']);
  });

  it('wraps deterministic mapping with local learning before AI fallback decisions', async () => {
    const repository = new ChromeFeedbackLearningRepository(new InMemoryStorageArea());
    const email = field({ selector: '#email', label: 'Email' });
    await repository.upsertMany([
      createLearnedMappingFeedback({
        kind: 'accepted',
        field: email,
        selector: '#email',
        profileKey: 'email',
        confidence: 0.8,
      }),
    ]);

    const model = new FeedbackLearningMappingModel(new FakeMappingModel([]), repository);
    const result = await model.mapFields({
      fields: [email],
      profileAttributes: { email: 'ada@example.com' },
      minConfidence: 0,
    });

    expect(result).toEqual([expect.objectContaining({ profileKey: 'email' })]);
  });
});
