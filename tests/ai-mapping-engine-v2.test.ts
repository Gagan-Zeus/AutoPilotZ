import { describe, expect, it } from 'vitest';
import type { AiMappingBatchRequest, AiMappingModelResult } from '../src/core/entities/AiMapping';
import type { AiMappingClient } from '../src/core/ports/AiMappingClient';
import { AiMappingEngine } from '../src/infra/ai/AiMappingEngine';
import { field } from './field-test-utils';
import { makeProfileData } from './profile-fixtures';

class FakeAiMappingClient implements AiMappingClient {
  calls: AiMappingBatchRequest[] = [];
  failuresRemaining = 0;

  constructor(private readonly responses: AiMappingModelResult[][]) {}

  mapFields(request: AiMappingBatchRequest): Promise<AiMappingModelResult[]> {
    this.calls.push(request);
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      return Promise.reject(new Error('Transient AI failure.'));
    }
    return Promise.resolve(this.responses.shift() ?? []);
  }
}

describe('AiMappingEngine', () => {
  it('maps batches to validated profile paths without returning profile values', async () => {
    const client = new FakeAiMappingClient([
      [
        {
          fieldId: 'email-field',
          profilePath: 'email',
          confidence: 0.96,
          reasoning: 'The field label is email.',
        },
      ],
      [
        {
          fieldId: 'phone-field',
          profilePath: 'phone',
          confidence: 0.94,
          reasoning: 'The field label is mobile.',
        },
      ],
    ]);
    const engine = new AiMappingEngine(client, undefined, {
      batchSize: 1,
      minConfidence: 0.9,
      retryBaseDelayMs: 0,
    });

    const results = await engine.map({
      profile: makeProfileData({
        email: 'private@example.com',
        phone: '+1 555 0100',
      }),
      fields: [
        field({ fieldId: 'email-field', selector: '#email', label: 'Email' }),
        field({ fieldId: 'phone-field', selector: '#phone', label: 'Mobile' }),
      ],
    });

    expect(client.calls).toHaveLength(2);
    expect(JSON.stringify(client.calls)).not.toContain('private@example.com');
    expect(results).toEqual([
      {
        fieldId: 'email-field',
        profilePath: 'email',
        confidence: 0.96,
        reasoning: 'The field label is email.',
      },
      {
        fieldId: 'phone-field',
        profilePath: 'phone',
        confidence: 0.94,
        reasoning: 'The field label is mobile.',
      },
    ]);
  });

  it('returns null for low confidence and hallucinated profile paths', async () => {
    const client = new FakeAiMappingClient([
      [
        {
          fieldId: 'low-confidence',
          profilePath: 'email',
          confidence: 0.72,
          reasoning: 'Weak match.',
        },
        {
          fieldId: 'bad-path',
          profilePath: 'socialSecurityNumber',
          confidence: 0.99,
          reasoning: 'Invalid invented path.',
        },
      ],
    ]);
    const engine = new AiMappingEngine(client, undefined, {
      minConfidence: 0.9,
      retryBaseDelayMs: 0,
    });

    const results = await engine.map({
      profile: makeProfileData(),
      fields: [
        field({ fieldId: 'low-confidence', selector: '#maybe-email' }),
        field({ fieldId: 'bad-path', selector: '#ssn' }),
      ],
    });

    expect(results).toEqual([null, null]);
  });

  it('retries transient AI failures', async () => {
    const client = new FakeAiMappingClient([
      [
        {
          fieldId: 'email-field',
          profilePath: 'email',
          confidence: 0.95,
          reasoning: 'Recovered after retry.',
        },
      ],
    ]);
    client.failuresRemaining = 1;
    const engine = new AiMappingEngine(client, undefined, {
      maxRetries: 2,
      retryBaseDelayMs: 0,
    });

    const results = await engine.map({
      profile: makeProfileData(),
      fields: [field({ fieldId: 'email-field', selector: '#email', label: 'Email' })],
    });

    expect(client.calls).toHaveLength(2);
    expect(results[0]).toEqual(
      expect.objectContaining({
        fieldId: 'email-field',
        profilePath: 'email',
      }),
    );
  });

  it('caches validated batch results', async () => {
    const client = new FakeAiMappingClient([
      [
        {
          fieldId: 'email-field',
          profilePath: 'email',
          confidence: 0.95,
          reasoning: 'Cached match.',
        },
      ],
    ]);
    const engine = new AiMappingEngine(client, undefined, {
      retryBaseDelayMs: 0,
    });
    const request = {
      profile: makeProfileData(),
      fields: [field({ fieldId: 'email-field', selector: '#email', label: 'Email' })],
    };

    const first = await engine.map(request);
    const second = await engine.map(request);

    expect(client.calls).toHaveLength(1);
    expect(second).toEqual(first);
  });
});
