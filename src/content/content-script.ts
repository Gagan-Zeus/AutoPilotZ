import type { ContentMessage, RuntimeResponse } from '../shared/messaging/messages';
import type { FieldMapping } from '../core/entities/Mapping';
import { FormExtractionEngine } from './form-extraction/FormExtractionEngine';

const formExtractionEngine = new FormExtractionEngine(document);
formExtractionEngine.startObserving();

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
    case 'CONTENT_APPLY_MAPPINGS':
      return applyMappings(message.mappings, message.values);
    default:
      return assertNever(message);
  }
}

function applyMappings(
  mappings: FieldMapping[],
  values: Record<string, string | number | boolean>,
): { applied: number } {
  let applied = 0;
  for (const mapping of mappings) {
    const element = findMappedElement(mapping.selector);
    const value = values[mapping.profileKey];
    if (!element || value === undefined) {
      continue;
    }

    if (element instanceof HTMLInputElement && element.type === 'checkbox') {
      element.checked = Boolean(value);
    } else if (element instanceof HTMLInputElement && element.type === 'radio') {
      element.checked = element.value === String(value);
    } else if (element instanceof HTMLElement && element.isContentEditable) {
      element.textContent = String(value);
    } else if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement
    ) {
      element.value = String(value);
    } else {
      continue;
    }
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.style.outline = '2px solid #0f766e';
    element.style.outlineOffset = '2px';
    applied += 1;
  }

  return { applied };
}

function findMappedElement(
  selector: string,
): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement | null {
  const selectorParts = selector.split('>>>').map((part) => part.trim());
  let root: Document | ShadowRoot = document;
  let element: Element | null = null;

  for (const selectorPart of selectorParts) {
    element = root.querySelector(selectorPart);
    if (!element) {
      return null;
    }
    if (selectorPart !== selectorParts.at(-1)) {
      if (!(element instanceof HTMLElement) || !element.shadowRoot) {
        return null;
      }
      root = element.shadowRoot;
    }
  }

  return element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLElement
    ? element
    : null;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported content message: ${JSON.stringify(value)}`);
}
