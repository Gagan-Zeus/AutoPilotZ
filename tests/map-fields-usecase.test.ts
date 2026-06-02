import { describe, expect, it } from 'vitest';
import type { FieldMapping, MappingRequest } from '../src/core/entities/Mapping';
import type { MappingModel } from '../src/core/ports/MappingModel';
import { MapFieldsUseCase } from '../src/core/usecases/MapFieldsUseCase';
import { field } from './field-test-utils';

class FakeMappingModel implements MappingModel {
  calls: MappingRequest[] = [];

  constructor(private readonly mappings: FieldMapping[]) {}

  mapFields(request: MappingRequest): Promise<FieldMapping[]> {
    this.calls.push(request);
    const fieldSelectors = new Set(request.fields.map((candidate) => candidate.selector));
    return Promise.resolve(this.mappings.filter((mapping) => fieldSelectors.has(mapping.selector)));
  }
}

describe('MapFieldsUseCase', () => {
  it('does not call AI when deterministic confidence is at least 90%', async () => {
    const deterministic = new FakeMappingModel([
      {
        selector: '#email',
        profileKey: 'email',
        confidence: 0.97,
        reason: 'rule',
      },
    ]);
    const ai = new FakeMappingModel([
      {
        selector: '#email',
        profileKey: 'phone',
        confidence: 0.99,
        reason: 'ai',
      },
    ]);

    const mappings = await new MapFieldsUseCase(deterministic, ai).execute({
      minConfidence: 0,
      profileAttributes: { email: 'ada@example.com', phone: '+1 555 0100' },
      fields: [field({ selector: '#email', label: 'Email' })],
    });

    expect(ai.calls).toHaveLength(0);
    expect(mappings).toEqual([
      expect.objectContaining({ selector: '#email', profileKey: 'email' }),
    ]);
  });

  it('calls AI only for fields below 90% deterministic confidence', async () => {
    const deterministic = new FakeMappingModel([
      {
        selector: '#email',
        profileKey: 'email',
        confidence: 0.97,
        reason: 'rule',
      },
      {
        selector: '#ambiguous',
        profileKey: 'firstName',
        confidence: 0.82,
        reason: 'fuzzy',
      },
    ]);
    const ai = new FakeMappingModel([
      {
        selector: '#ambiguous',
        profileKey: 'lastName',
        confidence: 0.93,
        reason: 'ai',
      },
    ]);

    const mappings = await new MapFieldsUseCase(deterministic, ai).execute({
      minConfidence: 0,
      profileAttributes: {
        email: 'ada@example.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
      },
      fields: [
        field({ selector: '#email', label: 'Email' }),
        field({ selector: '#ambiguous', label: 'Name' }),
      ],
    });

    expect(ai.calls).toHaveLength(1);
    const aiCall = ai.calls[0];
    if (!aiCall) {
      throw new Error('Expected AI fallback to be called once.');
    }
    expect(aiCall.fields.map((candidate) => candidate.selector)).toEqual(['#ambiguous']);
    expect(mappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ selector: '#email', profileKey: 'email' }),
        expect.objectContaining({ selector: '#ambiguous', profileKey: 'lastName' }),
      ]),
    );
  });
});
