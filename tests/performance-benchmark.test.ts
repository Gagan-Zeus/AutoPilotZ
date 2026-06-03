/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { FormExtractionEngine } from '../src/content/form-extraction/FormExtractionEngine';
import { FormFillingEngine } from '../src/content/form-filling/FormFillingEngine';
import type { FieldMapping } from '../src/core/entities/Mapping';

const benchmark = (operation: () => void, runs = 5): number => {
  const samples: number[] = [];
  for (let index = 0; index < runs; index += 1) {
    const startedAt = performance.now();
    operation();
    samples.push(performance.now() - startedAt);
  }

  return samples.sort((left, right) => left - right)[Math.floor(samples.length / 2)] ?? 0;
};

const renderSyntheticForm = (fieldCount: number): void => {
  document.title = 'Performance benchmark';
  document.body.innerHTML = `
    <form id="benchmark-form">
      <h2>Candidate profile</h2>
      ${Array.from(
        { length: fieldCount },
        (_, index) => `
          <label for="field-${index}">Field ${index}</label>
          <input
            id="field-${index}"
            name="field${index}"
            placeholder="Value ${index}"
            autocomplete="${index % 2 === 0 ? 'email' : 'name'}"
          />
        `,
      ).join('')}
    </form>
  `;
};

describe('performance benchmarks', () => {
  it('detects fields in under 100ms with warm cache support', () => {
    renderSyntheticForm(120);
    const engine = new FormExtractionEngine(document);

    const firstRunStartedAt = performance.now();
    const firstExtraction = engine.extract();
    const firstRunMs = performance.now() - firstRunStartedAt;
    const cachedRunMs = benchmark(() => {
      engine.extract();
    });

    expect(firstExtraction.fields).toHaveLength(120);
    expect(firstRunMs).toBeLessThan(100);
    expect(cachedRunMs).toBeLessThan(10);
  });

  it('autofills fields in under 500ms using batched selector resolution', () => {
    renderSyntheticForm(220);
    const mappings: FieldMapping[] = Array.from({ length: 220 }, (_, index) => ({
      fieldId: `field-${index}`,
      selector: `#field-${index}`,
      profileKey: `field${index}`,
      confidence: 1,
      reason: 'benchmark',
    }));
    const values = Object.fromEntries(
      mappings.map((mapping, index) => [mapping.profileKey, `filled-${index}`]),
    );
    const engine = new FormFillingEngine(document);

    const medianMs = benchmark(() => {
      for (const input of Array.from(document.querySelectorAll<HTMLInputElement>('input'))) {
        input.value = '';
      }
      const result = engine.applyMappings(mappings, values);
      expect(result.applied).toBe(220);
    });

    expect(medianMs).toBeLessThan(500);
    expect(document.querySelector<HTMLInputElement>('#field-219')?.value).toBe('filled-219');
  });
});
