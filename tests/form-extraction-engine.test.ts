/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { FormExtractionEngine } from '../src/content/form-extraction/FormExtractionEngine';

describe('FormExtractionEngine', () => {
  it('extracts normalized JSON for standard controls and validation rules', () => {
    document.body.innerHTML = `
      <form id="profile" name="profileForm" action="/apply" method="post">
        <h2>Personal details</h2>
        <label for="firstName">First name</label>
        <input id="firstName" name="firstName" placeholder="Ada" autocomplete="given-name" required minlength="2" />
        <label>Email <input name="email" type="email" aria-label="Primary email" aria-describedby="emailHelp" /></label>
        <small id="emailHelp">Use the email you check daily.</small>
        <select name="country" required>
          <option value="">Select country</option>
          <option value="US">United States</option>
        </select>
        <textarea name="summary" maxlength="280" placeholder="Short bio"></textarea>
        <div id="pitch" contenteditable="true" aria-label="Portfolio pitch"></div>
      </form>
    `;

    const extraction = new FormExtractionEngine(document).extract();

    expect(extraction.schemaVersion).toBe(1);
    expect(extraction.stats.fields).toBe(5);
    expect(extraction.sections).toEqual(
      expect.arrayContaining([expect.objectContaining({ heading: 'Personal details' })]),
    );

    const firstName = extraction.fields.find((field) => field.name === 'firstName');
    expect(firstName).toEqual(
      expect.objectContaining({
        id: 'firstName',
        name: 'firstName',
        placeholder: 'Ada',
        label: 'First name',
        autocomplete: 'given-name',
        sectionHeading: 'Personal details',
        required: true,
      }),
    );
    expect(firstName?.validationRules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'required', source: 'native' }),
        expect.objectContaining({ name: 'minlength', value: 2 }),
      ]),
    );

    const country = extraction.fields.find((field) => field.name === 'country');
    expect(country?.options).toEqual(
      expect.arrayContaining([expect.objectContaining({ value: 'US', label: 'United States' })]),
    );

    const contentEditable = extraction.fields.find((field) => field.id === 'pitch');
    expect(contentEditable).toEqual(
      expect.objectContaining({
        kind: 'contenteditable',
        tagName: 'contenteditable',
        ariaLabel: 'Portfolio pitch',
      }),
    );
  });

  it('extracts radio groups and checkbox groups with option labels', () => {
    document.body.innerHTML = `
      <form>
        <fieldset>
          <legend>Contact preference</legend>
          <label><input type="radio" name="contact" value="email" required /> Email</label>
          <label><input type="radio" name="contact" value="phone" /> Phone</label>
        </fieldset>
        <fieldset>
          <legend>Work authorization</legend>
          <label><input type="checkbox" name="workAuth" value="us" /> United States</label>
          <label><input type="checkbox" name="workAuth" value="ca" checked /> Canada</label>
        </fieldset>
      </form>
    `;

    const fields = new FormExtractionEngine(document).extract().fields;
    const radioGroup = fields.find((field) => field.kind === 'radio-group');
    const checkboxGroup = fields.find((field) => field.kind === 'checkbox-group');

    expect(radioGroup).toEqual(
      expect.objectContaining({
        name: 'contact',
        label: 'Contact preference',
        required: true,
        multiple: false,
      }),
    );
    expect(radioGroup?.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: 'email', label: 'Email' }),
        expect.objectContaining({ value: 'phone', label: 'Phone' }),
      ]),
    );

    expect(checkboxGroup).toEqual(
      expect.objectContaining({
        name: 'workAuth',
        label: 'Work authorization',
        multiple: true,
      }),
    );
    expect(checkboxGroup?.options).toEqual(
      expect.arrayContaining([expect.objectContaining({ value: 'ca', checked: true })]),
    );
  });

  it('traverses open Shadow DOM and marks shadow fields', () => {
    document.body.innerHTML = `<custom-profile id="host"></custom-profile>`;
    const host = document.querySelector('custom-profile')!;
    const shadowRoot = host.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = `
      <label for="github">GitHub</label>
      <input id="github" name="github" placeholder="https://github.com/user" />
    `;

    const extraction = new FormExtractionEngine(document).extract();
    const github = extraction.fields.find((field) => field.name === 'github');

    expect(extraction.stats.shadowRoots).toBe(1);
    expect(github).toEqual(
      expect.objectContaining({
        shadowDom: true,
        label: 'GitHub',
      }),
    );
    expect(github?.selector).toContain('>>>');
  });

  it('detects framework-specific form hints and validation metadata', () => {
    document.body.innerHTML = `
      <app-root ng-version="18.0.0">
        <input name="phone" formControlName="phone" ng-reflect-required="true" class="ng-invalid" />
      </app-root>
      <div data-v-app>
        <input name="portfolio" data-vv-required="true" />
      </div>
    `;

    const fields = new FormExtractionEngine(document).extract().fields;
    const phone = fields.find((field) => field.name === 'phone');
    const portfolio = fields.find((field) => field.name === 'portfolio');

    expect(phone?.frameworkHints.angular).toBe(true);
    expect(phone?.validationRules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'required', source: 'angular' }),
        expect.objectContaining({ name: 'invalid', source: 'angular' }),
      ]),
    );
    expect(portfolio?.frameworkHints.vue).toBe(true);
    expect(portfolio?.validationRules).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'required', source: 'vue' })]),
    );
  });

  it('observes dynamically inserted controls', async () => {
    document.body.innerHTML = `<form id="dynamic"></form>`;
    const engine = new FormExtractionEngine(document);
    let changes = 0;
    const stop = engine.startObserving(() => {
      changes += 1;
    });

    document
      .querySelector('form')!
      .insertAdjacentHTML(
        'beforeend',
        '<label for="lastName">Last name</label><input id="lastName" name="lastName" />',
      );
    await Promise.resolve();

    const extraction = engine.extract();
    stop();

    expect(changes).toBeGreaterThan(0);
    expect(extraction.fields).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'lastName', label: 'Last name' })]),
    );
  });
});
