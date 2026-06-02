import type { ContentMessage, RuntimeResponse } from '../shared/messaging/messages';
import { FormFillingEngine } from './form-filling/FormFillingEngine';
import { FormExtractionEngine } from './form-extraction/FormExtractionEngine';
import { PageMonitor } from './page-monitoring/PageMonitor';

const formExtractionEngine = new FormExtractionEngine(document);
const formFillingEngine = new FormFillingEngine(document);
const pageMonitor = new PageMonitor(document);
formExtractionEngine.startObserving();
pageMonitor.start();

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

function handleMessage(message: ContentMessage): unknown {
  switch (message.type) {
    case 'CONTENT_EXTRACT_FIELDS':
      return formExtractionEngine.extract().fields;
    case 'CONTENT_EXTRACT_FIELD_CONTEXTS':
      return formExtractionEngine.extract().fieldContexts;
    case 'CONTENT_EXTRACT_FORM_JSON':
      return formExtractionEngine.extract();
    case 'CONTENT_PAGE_MONITOR_SNAPSHOT':
      return pageMonitor.snapshot();
    case 'CONTENT_APPLY_MAPPINGS':
      return formFillingEngine.applyMappings(message.mappings, message.values, {
        confirmedSensitiveFieldIds: message.confirmedSensitiveFieldIds,
        confirmedSensitiveProfileKeys: message.confirmedSensitiveProfileKeys,
        confirmedSensitiveSelectors: message.confirmedSensitiveSelectors,
      });
    default:
      return assertNever(message);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported content message: ${JSON.stringify(value)}`);
}
