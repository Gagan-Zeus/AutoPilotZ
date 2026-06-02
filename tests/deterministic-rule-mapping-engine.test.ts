import { describe, expect, it } from 'vitest';
import { DeterministicRuleMappingEngine } from '../src/infra/mapping/DeterministicRuleMappingEngine';
import { field } from './field-test-utils';

describe('DeterministicRuleMappingEngine', () => {
  it('maps obvious English aliases above the AI threshold', async () => {
    const engine = new DeterministicRuleMappingEngine();

    const mappings = await engine.mapFields({
      minConfidence: 0,
      profileAttributes: {
        email: 'ada@example.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
        phone: '+1 555 0100',
      },
      fields: [
        field({ selector: '#email', label: 'Email' }),
        field({ selector: '#first', label: 'First name' }),
        field({ selector: '#surname', label: 'Surname' }),
        field({ selector: '#mobile', label: 'Mobile' }),
      ],
    });

    expect(mappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ selector: '#email', profileKey: 'email', confidence: 0.97 }),
        expect.objectContaining({
          selector: '#first',
          profileKey: 'firstName',
          confidence: 0.97,
        }),
        expect.objectContaining({
          selector: '#surname',
          profileKey: 'lastName',
          confidence: 0.97,
        }),
        expect.objectContaining({ selector: '#mobile', profileKey: 'phone', confidence: 0.97 }),
      ]),
    );
  });

  it('maps autocomplete and native input type deterministically', async () => {
    const engine = new DeterministicRuleMappingEngine();

    const mappings = await engine.mapFields({
      minConfidence: 0.9,
      profileAttributes: {
        email: 'ada@example.com',
        firstName: 'Ada',
      },
      fields: [
        field({ selector: '#given', autocomplete: 'given-name' }),
        field({ selector: '#email', type: 'email' }),
      ],
    });

    expect(mappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ selector: '#given', profileKey: 'firstName', confidence: 0.99 }),
        expect.objectContaining({ selector: '#email', profileKey: 'email', confidence: 0.98 }),
      ]),
    );
  });

  it('supports multilingual labels', async () => {
    const engine = new DeterministicRuleMappingEngine();

    const mappings = await engine.mapFields({
      minConfidence: 0.9,
      profileAttributes: {
        email: 'ada@example.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
        phone: '+1 555 0100',
      },
      fields: [
        field({ selector: '#correo', label: 'Correo electrónico' }),
        field({ selector: '#prenom', label: 'Prénom' }),
        field({ selector: '#nachname', label: 'Nachname' }),
        field({ selector: '#telefon', label: 'Telefon' }),
      ],
    });

    expect(mappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ selector: '#correo', profileKey: 'email' }),
        expect.objectContaining({ selector: '#prenom', profileKey: 'firstName' }),
        expect.objectContaining({ selector: '#nachname', profileKey: 'lastName' }),
        expect.objectContaining({ selector: '#telefon', profileKey: 'phone' }),
      ]),
    );
  });

  it('returns fuzzy matches below the AI threshold', async () => {
    const engine = new DeterministicRuleMappingEngine();

    const mappings = await engine.mapFields({
      minConfidence: 0,
      profileAttributes: { firstName: 'Ada' },
      fields: [field({ selector: '#frist', label: 'Frist name' })],
    });

    const mapping = mappings[0];
    if (!mapping) {
      throw new Error('Expected a fuzzy deterministic mapping.');
    }
    expect(mapping.selector).toBe('#frist');
    expect(mapping.profileKey).toBe('firstName');
    expect(typeof mapping.confidence).toBe('number');
    expect(mapping.confidence).toBeLessThan(0.9);
  });
});
