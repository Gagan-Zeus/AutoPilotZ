import { describe, expect, it } from 'vitest';
import type { DomFieldSignal } from '../src/core/entities/Mapping';
import { HeuristicAiMappingEngine } from '../src/infra/ai/HeuristicAiMappingEngine';

const field = (overrides: Partial<DomFieldSignal>): DomFieldSignal => ({
  fieldId: overrides.selector ?? '#field',
  kind: 'input',
  selector: overrides.selector ?? '#field',
  selectors: [overrides.selector ?? '#field'],
  tagName: 'input',
  required: false,
  disabled: false,
  readOnly: false,
  multiple: false,
  validationRules: [],
  options: [],
  frameworkHints: { react: false, angular: false, vue: false },
  shadowDom: false,
  ...overrides,
});

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
