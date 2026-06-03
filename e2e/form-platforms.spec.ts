import { expect } from '@playwright/test';
import {
  extractForm,
  fieldBy,
  fillMappings,
  gotoFixture,
  mappingFor,
  monitorSnapshot,
  test,
} from './support/extension';

test.describe('AutoPilotX form platform compatibility', () => {
  test('extracts and fills Google Forms-style fields', async ({ page, extensionWorker }) => {
    await gotoFixture(page, 'google-forms.html');

    const extraction = await extractForm(page, extensionWorker);
    const firstName = fieldBy(extraction.fields, (field) => field.id === 'gf-first-name');
    const email = fieldBy(extraction.fields, (field) => field.id === 'gf-email');
    const contact = fieldBy(extraction.fields, (field) => field.kind === 'radio-group');

    expect(extraction.stats.radioGroups).toBe(1);
    expect(firstName.context.formTitle).toContain('Google Forms candidate profile');
    expect(email.type).toBe('email');

    const result = await fillMappings(
      page,
      extensionWorker,
      [
        mappingFor(firstName, 'firstName'),
        mappingFor(email, 'email'),
        mappingFor(contact, 'contact'),
      ],
      { firstName: 'Ada', email: 'ada@example.com', contact: 'phone' },
    );

    expect(result.applied).toBe(3);
    await expect(page.locator('#gf-first-name')).toHaveValue('Ada');
    await expect(page.locator('#gf-email')).toHaveValue('ada@example.com');
    await expect(page.locator('input[name="entry.100003"][value="phone"]')).toBeChecked();
  });

  test('extracts and fills Typeform-style card fields', async ({ page, extensionWorker }) => {
    await gotoFixture(page, 'typeform.html');

    const extraction = await extractForm(page, extensionWorker);
    const fullName = fieldBy(extraction.fields, (field) => field.id === 'tf-full-name');
    const portfolio = fieldBy(extraction.fields, (field) => field.id === 'tf-portfolio');
    const summary = fieldBy(extraction.fields, (field) => field.id === 'tf-summary');

    expect(fullName.label).toBe('What is your full name?');
    expect(portfolio.type).toBe('url');

    const result = await fillMappings(
      page,
      extensionWorker,
      [
        mappingFor(fullName, 'fullName'),
        mappingFor(portfolio, 'portfolio'),
        mappingFor(summary, 'summary'),
      ],
      {
        fullName: 'Ada Lovelace',
        portfolio: 'https://example.com',
        summary: 'Mathematician and computing pioneer.',
      },
    );

    expect(result.applied).toBe(3);
    await expect(page.locator('#tf-full-name')).toHaveValue('Ada Lovelace');
    await expect(page.locator('#tf-portfolio')).toHaveValue('https://example.com');
    await expect(page.locator('#tf-summary')).toHaveValue('Mathematician and computing pioneer.');
  });

  test('updates React controlled inputs through synthetic-compatible events', async ({
    page,
    extensionWorker,
  }) => {
    await gotoFixture(page, 'react-form.html');

    const extraction = await extractForm(page, extensionWorker);
    const email = fieldBy(extraction.fields, (field) => field.id === 'react-email');
    const firstName = fieldBy(extraction.fields, (field) => field.id === 'react-first-name');

    const result = await fillMappings(
      page,
      extensionWorker,
      [mappingFor(email, 'email'), mappingFor(firstName, 'firstName')],
      { email: 'ada@example.com', firstName: 'Ada' },
    );

    expect(result.applied).toBe(2);
    await expect(page.locator('#react-email')).toHaveValue('ada@example.com');
    await expect(page.locator('#react-model')).toContainText('"email":"ada@example.com"');
    await expect(page.locator('#react-model')).toContainText('"firstName":"Ada"');
  });

  test('updates Angular-style form controls and model listeners', async ({
    page,
    extensionWorker,
  }) => {
    await gotoFixture(page, 'angular-form.html');

    const extraction = await extractForm(page, extensionWorker);
    const phone = fieldBy(extraction.fields, (field) => field.id === 'angular-phone');
    const city = fieldBy(extraction.fields, (field) => field.id === 'angular-city');

    const result = await fillMappings(
      page,
      extensionWorker,
      [mappingFor(phone, 'phone'), mappingFor(city, 'city')],
      { phone: '+1 555 0100', city: 'London' },
    );

    expect(result.applied).toBe(2);
    await expect(page.locator('#angular-model')).toContainText('"phone":"+1 555 0100"');
    await expect(page.locator('#angular-model')).toContainText('"city":"London"');
  });

  test('updates Vue-style v-model controls', async ({ page, extensionWorker }) => {
    await gotoFixture(page, 'vue-form.html');

    const extraction = await extractForm(page, extensionWorker);
    const github = fieldBy(extraction.fields, (field) => field.id === 'vue-github');
    const country = fieldBy(extraction.fields, (field) => field.id === 'vue-country');

    const result = await fillMappings(
      page,
      extensionWorker,
      [mappingFor(github, 'github'), mappingFor(country, 'country')],
      { github: 'https://github.com/ada', country: 'United Kingdom' },
    );

    expect(result.applied).toBe(2);
    await expect(page.locator('#vue-github')).toHaveValue('https://github.com/ada');
    await expect(page.locator('#vue-country')).toHaveValue('United Kingdom');
    await expect(page.locator('#vue-model')).toContainText('"country":"United Kingdom"');
  });

  test('handles multi-step forms as fields appear between steps', async ({
    page,
    extensionWorker,
  }) => {
    await gotoFixture(page, 'multi-step-form.html');

    const firstExtraction = await extractForm(page, extensionWorker);
    const email = fieldBy(firstExtraction.fields, (field) => field.id === 'multi-email');
    await fillMappings(page, extensionWorker, [mappingFor(email, 'email')], {
      email: 'ada@example.com',
    });
    await expect(page.locator('#multi-email')).toHaveValue('ada@example.com');

    await page.locator('#next-step').click();
    await expect(page.locator('#step-2')).toBeVisible();

    const secondExtraction = await extractForm(page, extensionWorker);
    const phone = fieldBy(secondExtraction.fields, (field) => field.id === 'multi-phone');
    const result = await fillMappings(page, extensionWorker, [mappingFor(phone, 'phone')], {
      phone: '+1 555 0100',
    });

    expect(result.applied).toBe(1);
    await expect(page.locator('#multi-phone')).toHaveValue('+1 555 0100');
  });

  test('monitors and fills dynamically inserted forms', async ({ page, extensionWorker }) => {
    await gotoFixture(page, 'dynamic-form.html');
    await monitorSnapshot(page, extensionWorker);

    await page.locator('#add-form').click();

    await expect
      .poll(async () => {
        const snapshot = await monitorSnapshot(page, extensionWorker);
        return snapshot.forms.some((form) => form.id === 'dynamic-profile');
      })
      .toBe(true);

    const extraction = await extractForm(page, extensionWorker);
    const lastName = fieldBy(extraction.fields, (field) => field.id === 'dynamic-last-name');
    const result = await fillMappings(page, extensionWorker, [mappingFor(lastName, 'lastName')], {
      lastName: 'Lovelace',
    });

    expect(result.applied).toBe(1);
    await expect(page.locator('#dynamic-last-name')).toHaveValue('Lovelace');
  });

  test('extracts and fills nested open Shadow DOM forms', async ({ page, extensionWorker }) => {
    await gotoFixture(page, 'shadow-dom-form.html');

    const extraction = await extractForm(page, extensionWorker);
    const linkedIn = fieldBy(extraction.fields, (field) => field.id === 'shadow-linkedin');
    const github = fieldBy(extraction.fields, (field) => field.id === 'shadow-github');

    expect(extraction.stats.shadowRoots).toBe(2);
    expect(linkedIn.shadowDom).toBe(true);
    expect(linkedIn.selector).toContain('>>>');

    const result = await fillMappings(
      page,
      extensionWorker,
      [mappingFor(linkedIn, 'linkedIn'), mappingFor(github, 'github')],
      {
        linkedIn: 'https://www.linkedin.com/in/ada-lovelace',
        github: 'https://github.com/ada',
      },
    );

    expect(result.applied).toBe(2);
    await expect
      .poll(async () =>
        page.evaluate(
          `document.querySelector('#outer-profile').shadowRoot
            .querySelector('#inner-profile').shadowRoot
            .querySelector('#shadow-github').value`,
        ),
      )
      .toBe('https://github.com/ada');
  });
});
