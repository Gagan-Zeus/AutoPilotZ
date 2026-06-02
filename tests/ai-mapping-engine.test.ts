import { describe, expect, it } from 'vitest';
import { HeuristicAiMappingEngine } from '../src/infra/ai/HeuristicAiMappingEngine';
import { field } from './field-test-utils';

describe('HeuristicAiMappingEngine', () => {
  it('maps fields using semantic signals', async () => {
    const engine = new HeuristicAiMappingEngine();

    const mappings = await engine.mapFields({
      minConfidence: 0.7,
      profileAttributes: {
        firstName: 'Ada',
        email: 'ada@example.com',
      },
      fields: [
        field({
          selector: '#first',
          label: 'First name',
        }),
        field({
          selector: '#email',
          type: 'email',
          autocomplete: 'email',
        }),
      ],
    });

    expect(mappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ selector: '#first', profileKey: 'firstName' }),
        expect.objectContaining({ selector: '#email', profileKey: 'email' }),
      ]),
    );
  });

  it('honors the confidence floor', async () => {
    const engine = new HeuristicAiMappingEngine();

    const mappings = await engine.mapFields({
      minConfidence: 0.99,
      profileAttributes: { email: 'ada@example.com' },
      fields: [field({ selector: '#email', autocomplete: 'email' })],
    });

    expect(mappings).toHaveLength(0);
  });
});
