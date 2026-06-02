/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { AutofillSafetyPolicy } from '../src/content/form-filling/AutofillSafetyPolicy';
import type { FieldMapping } from '../src/core/entities/Mapping';

const assessField = (html: string, mapping: FieldMapping) => {
  document.body.innerHTML = html;
  const element = document.querySelector<HTMLElement>(mapping.selector)!;
  return new AutofillSafetyPolicy().assess(mapping, element);
};

describe('AutofillSafetyPolicy', () => {
  it.each([
    [
      `<label for="password">Password</label><input id="password" type="password" />`,
      { selector: '#password', profileKey: 'password' },
      'password',
    ],
    [
      `<label for="cvv">Card CVV</label><input id="cvv" autocomplete="cc-csc" />`,
      { selector: '#cvv', profileKey: 'cvv' },
      'cvv',
    ],
    [
      `<label for="otp">One-time code</label><input id="otp" autocomplete="one-time-code" />`,
      { selector: '#otp', profileKey: 'otp' },
      'otp',
    ],
    [
      `<label for="mfa">Authenticator code</label><input id="mfa" />`,
      { selector: '#mfa', profileKey: 'mfaCode' },
      'mfa',
    ],
    [
      `<label for="ssn">Social Security Number</label><input id="ssn" />`,
      { selector: '#ssn', profileKey: 'ssn' },
      'ssn',
    ],
    [
      `<label for="aadhaar">Aadhaar number</label><input id="aadhaar" />`,
      { selector: '#aadhaar', profileKey: 'aadhaar' },
      'aadhaar',
    ],
    [
      `<label for="pin">Banking PIN</label><input id="pin" />`,
      { selector: '#pin', profileKey: 'bankingPin' },
      'bankingPin',
    ],
    [
      `<label for="recovery">Recovery code</label><input id="recovery" />`,
      { selector: '#recovery', profileKey: 'recoveryCode' },
      'recoveryCode',
    ],
  ])('requires confirmation for %s', (html, partialMapping, category) => {
    const decision = assessField(html, {
      fieldId: 'field-1',
      confidence: 1,
      reason: 'test',
      ...partialMapping,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.requiresConfirmation).toBe(true);
    expect(decision.block?.categories).toContain(category);
  });

  it('does not block non-banking postal PIN fields', () => {
    const decision = assessField(
      `<label for="postal">Postal PIN code</label><input id="postal" />`,
      {
        fieldId: 'postal-field',
        selector: '#postal',
        profileKey: 'postalCode',
        confidence: 1,
        reason: 'test',
      },
    );

    expect(decision.allowed).toBe(true);
    expect(decision.signals).toEqual([]);
  });

  it('allows a sensitive field only when that field is explicitly confirmed', () => {
    document.body.innerHTML = `<label for="ssn">SSN</label><input id="ssn" />`;
    const element = document.querySelector<HTMLInputElement>('#ssn')!;
    const policy = new AutofillSafetyPolicy();
    const mapping: FieldMapping = {
      fieldId: 'ssn-field',
      selector: '#ssn',
      profileKey: 'ssn',
      confidence: 1,
      reason: 'test',
    };

    expect(policy.assess(mapping, element, { confirmedSensitiveFieldIds: ['other'] }).allowed).toBe(
      false,
    );
    expect(
      policy.assess(mapping, element, { confirmedSensitiveFieldIds: ['ssn-field'] }).allowed,
    ).toBe(true);
  });
});
