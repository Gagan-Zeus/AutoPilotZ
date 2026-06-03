import { chromium, test as base } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import { resolve } from 'node:path';

interface RuntimeResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface ExtractedField {
  fieldId: string;
  kind: string;
  selector: string;
  selectors: string[];
  type?: string;
  id?: string;
  name?: string;
  label?: string;
  placeholder?: string;
  shadowDom: boolean;
  context: {
    labelText?: string;
    formTitle?: string;
    pageTitle: string;
    urlPath: string;
    sectionTitle?: string;
  };
}

export interface FormExtraction {
  fields: ExtractedField[];
  stats: {
    fields: number;
    forms: number;
    shadowRoots: number;
    radioGroups: number;
    checkboxGroups: number;
  };
}

export interface FillMapping {
  fieldId?: string;
  selector: string;
  profileKey: string;
  confidence: number;
  reason: string;
}

interface FillResult {
  applied: number;
  requiresConfirmation: unknown[];
  failed: Array<{ selector: string; profileKey: string; reason: string }>;
}

interface PageMonitorSnapshot {
  forms: Array<{ id?: string; name?: string; selector: string; fieldCount: number }>;
  lastEvents: Array<{ type: string }>;
}

type ContentMessage =
  | { type: 'CONTENT_EXTRACT_FORM_JSON' }
  | { type: 'CONTENT_PAGE_MONITOR_SNAPSHOT' }
  | {
      type: 'CONTENT_APPLY_MAPPINGS';
      mappings: FillMapping[];
      values: Record<string, string | number | boolean | readonly string[]>;
      confirmedSensitiveFieldIds?: string[];
      confirmedSensitiveSelectors?: string[];
      confirmedSensitiveProfileKeys?: string[];
    };

interface ExtensionFixtures {
  context: BrowserContext;
  page: Page;
  extensionWorker: Worker;
}

export const test = base.extend<ExtensionFixtures>({
  context: async ({ browserName }, use, testInfo) => {
    if (browserName !== 'chromium') {
      throw new Error('AutoPilotX extension E2E tests require Chromium.');
    }

    const extensionPath = resolve('dist');
    const userDataDir = testInfo.outputPath('chromium-user-data');
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: process.env.PLAYWRIGHT_HEADLESS === 'true',
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });

    await use(context);
    await context.close();
  },
  page: async ({ context }, use) => {
    const page = await context.newPage();
    await use(page);
    await page.close();
  },
  extensionWorker: async ({ context }, use) => {
    const worker =
      context
        .serviceWorkers()
        .find((candidate) => candidate.url().startsWith('chrome-extension://')) ??
      (await context.waitForEvent('serviceworker'));
    await use(worker);
  },
});

export const gotoFixture = async (page: Page, fixtureName: string): Promise<void> => {
  await page.goto(`/${fixtureName}`);
  await page.waitForLoadState('domcontentloaded');
};

export const extractForm = async (page: Page, worker: Worker): Promise<FormExtraction> =>
  sendContentMessage<FormExtraction>(page, worker, { type: 'CONTENT_EXTRACT_FORM_JSON' });

export const fillMappings = async (
  page: Page,
  worker: Worker,
  mappings: FillMapping[],
  values: Record<string, string | number | boolean | readonly string[]>,
): Promise<FillResult> =>
  sendContentMessage<FillResult>(page, worker, {
    type: 'CONTENT_APPLY_MAPPINGS',
    mappings,
    values,
    confirmedSensitiveSelectors: mappings.map((mapping) => mapping.selector),
    confirmedSensitiveProfileKeys: mappings.map((mapping) => mapping.profileKey),
  });

export const monitorSnapshot = async (page: Page, worker: Worker): Promise<PageMonitorSnapshot> =>
  sendContentMessage<PageMonitorSnapshot>(page, worker, {
    type: 'CONTENT_PAGE_MONITOR_SNAPSHOT',
  });

export const fieldBy = (
  fields: ExtractedField[],
  predicate: (field: ExtractedField) => boolean,
): ExtractedField => {
  const field = fields.find(predicate);
  if (!field) {
    throw new Error(`Expected field was not extracted. Fields: ${JSON.stringify(fields, null, 2)}`);
  }
  return field;
};

export const mappingFor = (field: ExtractedField, profileKey: string): FillMapping => ({
  fieldId: field.fieldId,
  selector: field.selector,
  profileKey,
  confidence: 1,
  reason: 'Playwright E2E mapping.',
});

const sendContentMessage = async <T>(
  page: Page,
  worker: Worker,
  message: ContentMessage,
): Promise<T> => {
  await page.bringToFront();

  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const tabId = await tabIdForPage(worker, page);
      const response = await worker.evaluate(
        async ({ targetTabId, targetMessage }) => {
          type ChromeApi = {
            tabs: {
              sendMessage(tabId: number, message: unknown): Promise<RuntimeResponse<unknown>>;
            };
          };
          const chromeApi = (globalThis as unknown as { chrome: ChromeApi }).chrome;
          return chromeApi.tabs.sendMessage(targetTabId, targetMessage);
        },
        { targetTabId: tabId, targetMessage: message },
      );

      if (!response.ok) {
        throw new Error(response.error ?? 'Content script returned an error.');
      }

      return response.data as T;
    } catch (error) {
      if (attempt === 29) {
        throw error;
      }
      await page.waitForTimeout(100);
    }
  }

  throw new Error('Content script did not respond.');
};

const tabIdForPage = async (worker: Worker, page: Page): Promise<number> => {
  const pageUrl = page.url();
  const tabId = await worker.evaluate(async () => {
    type ChromeApi = {
      tabs: {
        query(queryInfo: Record<string, unknown>): Promise<Array<{ id?: number }>>;
      };
    };
    const chromeApi = (globalThis as unknown as { chrome: ChromeApi }).chrome;
    const [tab] = await chromeApi.tabs.query({ active: true, currentWindow: true });
    return tab?.id;
  });

  const matchingTabId = await worker.evaluate(async (targetUrl) => {
    type ChromeApi = {
      tabs: {
        query(queryInfo: Record<string, unknown>): Promise<Array<{ id?: number; url?: string }>>;
      };
    };
    const chromeApi = (globalThis as unknown as { chrome: ChromeApi }).chrome;
    const tabs = await chromeApi.tabs.query({});
    return tabs.find((tab) => tab.url === targetUrl)?.id;
  }, pageUrl);

  if (typeof matchingTabId === 'number') {
    return matchingTabId;
  }

  if (typeof tabId !== 'number') {
    throw new Error('Unable to resolve active tab id.');
  }

  return tabId;
};
