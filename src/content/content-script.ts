import type { ContentMessage, RuntimeResponse } from '../shared/messaging/messages';
import { FormFillingEngine } from './form-filling/FormFillingEngine';
import { FormExtractionEngine } from './form-extraction/FormExtractionEngine';
import { PageMonitor } from './page-monitoring/PageMonitor';

let formExtractionEngine: FormExtractionEngine | undefined;
let formFillingEngine: FormFillingEngine | undefined;
let pageMonitor: PageMonitor | undefined;

const contentScriptGlobal = globalThis as typeof globalThis & {
  __autopilotxContentScriptReady?: boolean;
};

if (!contentScriptGlobal.__autopilotxContentScriptReady) {
  contentScriptGlobal.__autopilotxContentScriptReady = true;

  chrome.runtime.onMessage.addListener((message: ContentMessage, _sender, sendResponse) => {
    try {
      const data = handleMessage(message);
      sendResponse({ ok: true, data } satisfies RuntimeResponse<unknown>);
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : 'Content script failed.',
      } satisfies RuntimeResponse<never>);
    }
    return false;
  });
}

function handleMessage(message: ContentMessage): unknown {
  switch (message.type) {
    case 'CONTENT_EXTRACT_FIELDS':
      return getFormExtractionEngine().extract().fields;
    case 'CONTENT_EXTRACT_FIELD_CONTEXTS':
      return getFormExtractionEngine().extract().fieldContexts;
    case 'CONTENT_EXTRACT_FORM_JSON':
      return getFormExtractionEngine().extract();
    case 'CONTENT_PAGE_MONITOR_SNAPSHOT':
      return getPageMonitor().snapshot();
    case 'CONTENT_APPLY_MAPPINGS':
      return getFormFillingEngine().applyMappings(message.mappings, message.values, {
        confirmedSensitiveFieldIds: message.confirmedSensitiveFieldIds,
        confirmedSensitiveProfileKeys: message.confirmedSensitiveProfileKeys,
        confirmedSensitiveSelectors: message.confirmedSensitiveSelectors,
      });
    default:
      return assertNever(message);
  }
}

function getFormExtractionEngine(): FormExtractionEngine {
  if (!formExtractionEngine) {
    formExtractionEngine = new FormExtractionEngine(document);
    formExtractionEngine.startObserving();
  }
  return formExtractionEngine;
}

function getFormFillingEngine(): FormFillingEngine {
  formFillingEngine ??= new FormFillingEngine(document);
  return formFillingEngine;
}

function getPageMonitor(): PageMonitor {
  if (!pageMonitor) {
    pageMonitor = new PageMonitor(document);
    pageMonitor.start();
  }
  return pageMonitor;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported content message: ${JSON.stringify(value)}`);
}
