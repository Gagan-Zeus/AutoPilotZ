import type { ContentMessage, RuntimeResponse } from '../shared/messaging/messages';
import type { DomFieldSignal, FieldMapping } from '../core/entities/Mapping';

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
      return extractFields();
    case 'CONTENT_APPLY_MAPPINGS':
      return applyMappings(message.mappings, message.values);
    default:
      return assertNever(message);
  }
}

function extractFields(): DomFieldSignal[] {
  const controls = [...document.querySelectorAll('input, select, textarea')];
  return controls.filter(isVisibleControl).map((control) => {
    const element = control as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    const id = element.id || undefined;
    return {
      selector: stableSelector(element),
      tagName: element.tagName.toLowerCase() as DomFieldSignal['tagName'],
      type: 'type' in element ? element.type : undefined,
      name: element.getAttribute('name') ?? undefined,
      id,
      label: findLabel(element),
      placeholder: element.getAttribute('placeholder') ?? undefined,
      autocomplete: element.getAttribute('autocomplete') ?? undefined,
      ariaLabel: element.getAttribute('aria-label') ?? undefined,
    };
  });
}

function applyMappings(
  mappings: FieldMapping[],
  values: Record<string, string | number | boolean>,
): { applied: number } {
  let applied = 0;
  for (const mapping of mappings) {
    const element = document.querySelector<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >(mapping.selector);
    const value = values[mapping.profileKey];
    if (!element || value === undefined) {
      continue;
    }

    element.value = String(value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.style.outline = '2px solid #0f766e';
    element.style.outlineOffset = '2px';
    applied += 1;
  }

  return { applied };
}

function stableSelector(element: Element): string {
  if (element.id) {
    return `#${CSS.escape(element.id)}`;
  }

  const name = element.getAttribute('name');
  if (name) {
    return `${element.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
  }

  const segments: string[] = [];
  let current: Element | null = element;
  while (current && current !== document.body) {
    const parentElement: Element | null = current.parentElement;
    if (!parentElement) {
      break;
    }
    const siblings = Array.from(parentElement.children);
    const index = siblings.indexOf(current) + 1;
    segments.unshift(`${current.tagName.toLowerCase()}:nth-child(${index})`);
    current = parentElement;
  }

  return segments.join(' > ');
}

function findLabel(element: HTMLElement): string | undefined {
  if (element.id) {
    const label = document.querySelector<HTMLLabelElement>(
      `label[for="${CSS.escape(element.id)}"]`,
    );
    if (label?.textContent?.trim()) {
      return label.textContent.trim();
    }
  }

  const wrappingLabel = element.closest('label');
  if (wrappingLabel?.textContent?.trim()) {
    return wrappingLabel.textContent.trim();
  }

  return undefined;
}

function isVisibleControl(element: Element): boolean {
  const control = element as HTMLElement;
  const rect = control.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && control.offsetParent !== null;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported content message: ${JSON.stringify(value)}`);
}
