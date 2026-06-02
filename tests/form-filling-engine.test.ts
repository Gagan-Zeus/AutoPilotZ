/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { FormFillingEngine } from '../src/content/form-filling/FormFillingEngine';

const eventsFor = (element: Element): string[] => {
  const events: string[] = [];
  for (const eventName of ['beforeinput', 'input', 'change', 'blur', 'focusout']) {
    element.addEventListener(eventName, () => events.push(eventName));
  }
  return events;
};

describe('FormFillingEngine', () => {
  it('fills text inputs through native setters and dispatches required events', () => {
    document.body.innerHTML = `<input id="firstName" />`;
    const input = document.querySelector<HTMLInputElement>('#firstName')!;
    const events = eventsFor(input);
    let trackerValue = '';
    Object.assign(input, {
      _valueTracker: {
        setValue(value: string) {
          trackerValue = value;
        },
      },
    });

    const result = new FormFillingEngine(document).applyMappings(
      [{ selector: '#firstName', profileKey: 'firstName', confidence: 1, reason: 'test' }],
      { firstName: 'Ada' },
    );

    expect(result.applied).toBe(1);
    expect(input.value).toBe('Ada');
    expect(trackerValue).toBe('');
    expect(events).toEqual(['beforeinput', 'input', 'change', 'blur', 'focusout']);
  });

  it('fills textarea and select controls', () => {
    document.body.innerHTML = `
      <textarea id="summary"></textarea>
      <select id="country">
        <option value="">Choose</option>
        <option value="US">United States</option>
      </select>
    `;
    const textarea = document.querySelector<HTMLTextAreaElement>('#summary')!;
    const select = document.querySelector<HTMLSelectElement>('#country')!;

    const result = new FormFillingEngine(document).applyMappings(
      [
        { selector: '#summary', profileKey: 'summary', confidence: 1, reason: 'test' },
        { selector: '#country', profileKey: 'country', confidence: 1, reason: 'test' },
      ],
      { summary: 'Researcher', country: 'US' },
    );

    expect(result.applied).toBe(2);
    expect(textarea.value).toBe('Researcher');
    expect(select.value).toBe('US');
  });

  it('fills radio groups by matching supplied value', () => {
    document.body.innerHTML = `
      <label><input type="radio" name="contact" value="email" /> Email</label>
      <label><input id="phone" type="radio" name="contact" value="phone" /> Phone</label>
    `;

    const phone = document.querySelector<HTMLInputElement>('#phone')!;
    const events = eventsFor(phone);
    phone.addEventListener('click', () => events.push('click'));

    const result = new FormFillingEngine(document).applyMappings(
      [{ selector: 'input[name="contact"]', profileKey: 'contact', confidence: 1, reason: 'test' }],
      { contact: 'phone' },
    );

    expect(result.applied).toBe(1);
    expect(phone.checked).toBe(true);
    expect(events).toEqual(['click', 'input', 'change', 'blur', 'focusout']);
  });

  it('fills checkbox groups from booleans and arrays', () => {
    document.body.innerHTML = `
      <input id="subscribe" type="checkbox" value="yes" />
      <input id="us" type="checkbox" name="workAuth" value="US" />
      <input id="ca" type="checkbox" name="workAuth" value="CA" />
    `;

    const result = new FormFillingEngine(document).applyMappings(
      [
        { selector: '#subscribe', profileKey: 'subscribe', confidence: 1, reason: 'test' },
        { selector: '#us', profileKey: 'countries', confidence: 1, reason: 'test' },
        { selector: '#ca', profileKey: 'countries', confidence: 1, reason: 'test' },
      ],
      { subscribe: true, countries: ['CA'] },
    );

    expect(result.applied).toBe(3);
    expect(document.querySelector<HTMLInputElement>('#subscribe')?.checked).toBe(true);
    expect(document.querySelector<HTMLInputElement>('#us')?.checked).toBe(false);
    expect(document.querySelector<HTMLInputElement>('#ca')?.checked).toBe(true);
  });

  it('updates React 17 and React 18 controlled inputs through delegated root events', () => {
    document.body.innerHTML = `
      <div id="react-root">
        <input id="email" />
      </div>
    `;
    const input = document.querySelector<HTMLInputElement>('#email')!;
    const rootEvents: string[] = [];
    const root = document.querySelector('#react-root')!;
    for (const eventName of ['beforeinput', 'input', 'change', 'focusout']) {
      root.addEventListener(eventName, () => rootEvents.push(eventName));
    }
    Object.assign(input, {
      __reactFiber$test: {},
      _valueTracker: {
        setValue(value: string) {
          rootEvents.push(`tracker:${value}`);
        },
      },
    });

    const result = new FormFillingEngine(document).applyMappings(
      [{ selector: '#email', profileKey: 'email', confidence: 1, reason: 'test' }],
      { email: 'ada@example.com' },
    );

    expect(result.applied).toBe(1);
    expect(input.value).toBe('ada@example.com');
    expect(rootEvents).toEqual(['tracker:', 'beforeinput', 'input', 'change', 'focusout']);
  });

  it('supports Next.js and Remix React roots', () => {
    document.body.innerHTML = `
      <div id="__next"><input id="nextEmail" /></div>
      <div id="__remix"><input id="remixEmail" /></div>
    `;
    const nextEvents: string[] = [];
    const remixEvents: string[] = [];
    document
      .querySelector('#__next')!
      .addEventListener('beforeinput', () => nextEvents.push('beforeinput'));
    document
      .querySelector('#__remix')!
      .addEventListener('beforeinput', () => remixEvents.push('beforeinput'));

    const result = new FormFillingEngine(document).applyMappings(
      [
        { selector: '#nextEmail', profileKey: 'nextEmail', confidence: 1, reason: 'test' },
        { selector: '#remixEmail', profileKey: 'remixEmail', confidence: 1, reason: 'test' },
      ],
      { nextEmail: 'next@example.com', remixEmail: 'remix@example.com' },
    );

    expect(result.applied).toBe(2);
    expect(document.querySelector<HTMLInputElement>('#nextEmail')?.value).toBe('next@example.com');
    expect(document.querySelector<HTMLInputElement>('#remixEmail')?.value).toBe(
      'remix@example.com',
    );
    expect(nextEvents).toEqual(['beforeinput']);
    expect(remixEvents).toEqual(['beforeinput']);
  });

  it('fills contenteditable fields and Shadow DOM fields', () => {
    document.body.innerHTML = `
      <div id="bio" contenteditable="true"></div>
      <profile-form id="host"></profile-form>
    `;
    const host = document.querySelector<HTMLElement>('#host')!;
    const shadowRoot = host.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = `<input id="github" />`;

    const result = new FormFillingEngine(document).applyMappings(
      [
        { selector: '#bio', profileKey: 'bio', confidence: 1, reason: 'test' },
        { selector: '#host >>> #github', profileKey: 'github', confidence: 1, reason: 'test' },
      ],
      { bio: 'Engineer', github: 'https://github.com/ada' },
    );

    expect(result.applied).toBe(2);
    expect(document.querySelector<HTMLElement>('#bio')?.textContent).toBe('Engineer');
    expect(shadowRoot.querySelector<HTMLInputElement>('#github')?.value).toBe(
      'https://github.com/ada',
    );
  });

  it('reports failed mappings without throwing', () => {
    const result = new FormFillingEngine(document).applyMappings(
      [{ selector: '#missing', profileKey: 'email', confidence: 1, reason: 'test' }],
      {},
    );

    expect(result.applied).toBe(0);
    expect(result.failed).toEqual([
      {
        selector: '#missing',
        profileKey: 'email',
        reason: 'No supplied profile value for mapping.',
      },
    ]);
  });
});
