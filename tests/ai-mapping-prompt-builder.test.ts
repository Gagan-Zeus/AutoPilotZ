import { describe, expect, it } from 'vitest';
import { AiMappingPromptBuilder } from '../src/infra/ai/AiMappingPromptBuilder';

describe('AiMappingPromptBuilder', () => {
  it('renders the strict JSON-only mapping prompt without profile values', () => {
    const prompt = new AiMappingPromptBuilder().build({
      profilePaths: [
        { path: 'email', kind: 'string', populated: true },
        { path: 'phone', kind: 'string', populated: true },
      ],
      fields: [
        {
          fieldId: 'field-1',
          type: 'email',
          label: 'Email',
          context: {
            labelText: 'Email',
            pageTitle: 'Apply',
            urlPath: '/apply',
          },
          required: true,
          validationRules: [],
          options: [],
        },
      ],
    });

    expect(prompt).toContain('Never invent values.');
    expect(prompt).toContain('Return null if uncertain.');
    expect(prompt).toContain('"mappings"');
    expect(prompt).toContain('"profileKey"');
    expect(prompt).toContain('"email"');
    expect(prompt).not.toContain('ada@example.com');
  });
});
