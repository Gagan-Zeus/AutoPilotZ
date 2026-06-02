import { describe, expect, it } from 'vitest';
import { HeuristicAiMappingEngine } from '../src/infra/ai/HeuristicAiMappingEngine';

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
        {
          selector: '#first',
          tagName: 'input',
          label: 'First name',
        },
        {
          selector: '#email',
          tagName: 'input',
          type: 'email',
          autocomplete: 'email',
        },
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
      fields: [{ selector: '#email', tagName: 'input', autocomplete: 'email' }],
    });

    expect(mappings).toHaveLength(0);
  });
});
