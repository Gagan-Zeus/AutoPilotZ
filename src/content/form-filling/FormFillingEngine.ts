import type { FieldMapping } from '../../core/entities/Mapping';
import {
  AutofillSafetyPolicy,
  type AutofillSafetyBlock,
  type AutofillSafetyOptions,
} from './AutofillSafetyPolicy';

export type FillValue = string | number | boolean | readonly string[];

export interface FillResult {
  applied: number;
  requiresConfirmation: AutofillSafetyBlock[];
  failed: Array<{
    selector: string;
    profileKey: string;
    reason: string;
  }>;
}

type FillableElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement;

interface ReactTrackedElement extends Element {
  _valueTracker?: {
    setValue(value: string): void;
  };
}

interface FrameworkHints {
  reactLike: boolean;
  angularLike: boolean;
  vueLike: boolean;
}

interface FillOperation {
  mapping: FieldMapping;
  element: FillableElement;
  value: FillValue;
}

interface FillRunCache {
  selectors: Map<string, FillableElement | null>;
  radioGroups: Map<string, HTMLInputElement[]>;
}

export class FormFillingEngine {
  constructor(
    private readonly rootDocument: Document = document,
    private readonly safetyPolicy = new AutofillSafetyPolicy(),
  ) {}

  applyMappings(
    mappings: FieldMapping[],
    values: Record<string, FillValue>,
    options: AutofillSafetyOptions = {},
  ): FillResult {
    const result: FillResult = { applied: 0, requiresConfirmation: [], failed: [] };
    const runCache: FillRunCache = {
      selectors: new Map(),
      radioGroups: new Map(),
    };
    const operations: FillOperation[] = [];

    for (const mapping of mappings) {
      const value = values[mapping.profileKey];
      if (value === undefined) {
        result.failed.push({
          selector: mapping.selector,
          profileKey: mapping.profileKey,
          reason: 'No supplied profile value for mapping.',
        });
        continue;
      }

      const element = this.findMappedElement(mapping.selector, runCache);
      if (!element) {
        result.failed.push({
          selector: mapping.selector,
          profileKey: mapping.profileKey,
          reason: 'Mapped field was not found in the document.',
        });
        continue;
      }

      operations.push({ mapping, element, value });
    }

    for (const operation of operations) {
      const { mapping, element, value } = operation;
      const safetyDecision = this.safetyPolicy.assess(mapping, element, options);
      if (!safetyDecision.allowed) {
        if (safetyDecision.block) {
          result.requiresConfirmation.push(safetyDecision.block);
        }
        continue;
      }

      const applied = this.fillElement(element, value, runCache);
      if (!applied) {
        result.failed.push({
          selector: mapping.selector,
          profileKey: mapping.profileKey,
          reason: 'Mapped field type is not fillable.',
        });
        continue;
      }

      this.markApplied(element);
      result.applied += 1;
    }

    return result;
  }

  findMappedElement(selector: string, cache?: FillRunCache): FillableElement | null {
    if (cache?.selectors.has(selector)) {
      return cache.selectors.get(selector) ?? null;
    }

    const selectorParts = selector.split('>>>').map((part) => part.trim());
    let root: Document | ShadowRoot = this.rootDocument;
    let element: Element | null = null;

    for (const selectorPart of selectorParts) {
      element = root.querySelector(selectorPart);
      if (!element) {
        cache?.selectors.set(selector, null);
        return null;
      }
      if (selectorPart !== selectorParts.at(-1)) {
        if (!(element instanceof HTMLElement) || !element.shadowRoot) {
          cache?.selectors.set(selector, null);
          return null;
        }
        root = element.shadowRoot;
      }
    }

    const fillable = this.isFillableElement(element) ? element : null;
    cache?.selectors.set(selector, fillable);
    return fillable;
  }

  private fillElement(element: FillableElement, value: FillValue, cache: FillRunCache): boolean {
    if (element instanceof HTMLInputElement) {
      return this.fillInput(element, value, cache);
    }

    if (element instanceof HTMLTextAreaElement) {
      this.setNativeValue(element, String(value));
      this.dispatchFrameworkEvents(element);
      return true;
    }

    if (element instanceof HTMLSelectElement) {
      return this.fillSelect(element, value);
    }

    if (this.isContentEditable(element)) {
      element.textContent = String(value);
      this.dispatchFrameworkEvents(element);
      return true;
    }

    return false;
  }

  private fillInput(input: HTMLInputElement, value: FillValue, cache: FillRunCache): boolean {
    switch (input.type) {
      case 'checkbox':
        return this.fillCheckbox(input, value);
      case 'radio':
        return this.fillRadio(input, value, cache);
      default:
        this.setNativeValue(input, String(value));
        this.dispatchFrameworkEvents(input);
        return true;
    }
  }

  private fillCheckbox(input: HTMLInputElement, value: FillValue): boolean {
    const selected = Array.isArray(value)
      ? value.map(String).includes(input.value)
      : typeof value === 'boolean'
        ? value
        : String(value) === input.value || String(value).toLowerCase() === 'true';

    this.setNativeChecked(input, selected);
    this.dispatchChoiceCompatibilityEvents(input, selected);
    return true;
  }

  private fillRadio(input: HTMLInputElement, value: FillValue, cache: FillRunCache): boolean {
    const targetValue = String(value);
    const root = input.getRootNode() as Document | ShadowRoot;
    const groupKey = input.name
      ? `${this.rootKey(root)}:radio:${input.name}`
      : `${this.rootKey(root)}:radio:${this.elementKey(input)}`;
    const cachedGroup = cache.radioGroups.get(groupKey);
    const group =
      cachedGroup ??
      (input.name
        ? Array.from(
            root.querySelectorAll<HTMLInputElement>(
              `input[type="radio"][name="${this.escapeCss(input.name)}"]`,
            ),
          )
        : [input]);
    cache.radioGroups.set(groupKey, group);
    const target = group.find((candidate) => candidate.value === targetValue) ?? input;

    for (const candidate of group) {
      this.setNativeChecked(candidate, candidate === target && candidate.value === targetValue);
    }
    this.dispatchChoiceCompatibilityEvents(target, target.value === targetValue);
    return target.value === targetValue;
  }

  private fillSelect(select: HTMLSelectElement, value: FillValue): boolean {
    const values = Array.isArray(value) ? value.map(String) : [String(value)];
    const options = Array.from(select.options);
    let matched = false;

    for (const option of options) {
      const selected = values.includes(option.value) || values.includes(option.text);
      option.selected = select.multiple ? selected : selected && !matched;
      matched = matched || selected;
    }

    if (!matched && !select.multiple) {
      this.setNativeValue(select, String(value));
      matched = select.value === String(value);
    }

    this.dispatchFrameworkEvents(select);
    return matched;
  }

  private setNativeValue(
    element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
    value: string,
  ): void {
    const previousValue = element.value;
    const descriptor = this.findPropertySetter(element, 'value');

    if (descriptor?.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }

    this.resetReactValueTracker(element, previousValue);
  }

  private setNativeChecked(input: HTMLInputElement, checked: boolean): void {
    const previousValue = String(input.checked);
    const descriptor = this.findPropertySetter(input, 'checked');

    if (descriptor?.set) {
      descriptor.set.call(input, checked);
    } else {
      input.checked = checked;
    }

    this.resetReactValueTracker(input, previousValue);
  }

  private resetReactValueTracker(element: Element, previousValue: string): void {
    (element as ReactTrackedElement)._valueTracker?.setValue(previousValue);
  }

  private dispatchFrameworkEvents(element: Element): void {
    const hints = this.detectFrameworkHints(element);
    if (hints.reactLike || hints.vueLike || hints.angularLike) {
      element.dispatchEvent(this.createBeforeInputEvent());
    }
    element.dispatchEvent(this.createInputEvent());
    element.dispatchEvent(this.createEvent('change', { bubbles: true, cancelable: true }));
    element.dispatchEvent(this.createFocusEvent('blur', { bubbles: false, cancelable: false }));
    element.dispatchEvent(this.createFocusEvent('focusout', { bubbles: true, cancelable: false }));
  }

  private dispatchChoiceCompatibilityEvents(
    input: HTMLInputElement,
    expectedChecked: boolean,
  ): void {
    input.dispatchEvent(this.createMouseEvent('click'));
    this.setNativeChecked(input, expectedChecked);
    this.dispatchFrameworkEvents(input);
  }

  private createBeforeInputEvent(): Event {
    const view = this.rootDocument.defaultView;
    if (view?.InputEvent) {
      return new view.InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        composed: true,
        inputType: 'insertReplacementText',
      });
    }

    return this.createEvent('beforeinput', { bubbles: true, cancelable: true });
  }

  private createInputEvent(): Event {
    const view = this.rootDocument.defaultView;
    if (view?.InputEvent) {
      return new view.InputEvent('input', {
        bubbles: true,
        cancelable: true,
        composed: true,
        inputType: 'insertReplacementText',
      });
    }

    return this.createEvent('input', { bubbles: true, cancelable: true });
  }

  private createMouseEvent(type: string): Event {
    const view = this.rootDocument.defaultView;
    if (view?.MouseEvent) {
      return new view.MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
      });
    }

    return this.createEvent(type, { bubbles: true, cancelable: true });
  }

  private createFocusEvent(type: string, init: Pick<EventInit, 'bubbles' | 'cancelable'>): Event {
    const view = this.rootDocument.defaultView;
    if (view?.FocusEvent) {
      return new view.FocusEvent(type, {
        ...init,
        composed: true,
      });
    }

    return this.createEvent(type, init);
  }

  private createEvent(type: string, init: Pick<EventInit, 'bubbles' | 'cancelable'>): Event {
    const EventConstructor = this.rootDocument.defaultView?.Event ?? Event;
    return new EventConstructor(type, {
      ...init,
      composed: true,
    });
  }

  private findPropertySetter(
    element: Element,
    property: 'value' | 'checked',
  ): PropertyDescriptor | undefined {
    let prototype: object | null = Object.getPrototypeOf(element) as object | null;
    while (prototype) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
      if (descriptor?.set) {
        return descriptor;
      }
      const nextPrototype = Object.getPrototypeOf(prototype) as object | null;
      prototype = nextPrototype;
    }
    return undefined;
  }

  private detectFrameworkHints(element: Element): FrameworkHints {
    const propertyNames = Object.keys(element as unknown as Record<string, unknown>);
    const reactLike =
      propertyNames.some(
        (property) =>
          property.startsWith('__reactFiber$') ||
          property.startsWith('__reactProps$') ||
          property.startsWith('__reactInternalInstance$'),
      ) ||
      Boolean((element as ReactTrackedElement)._valueTracker) ||
      Boolean(
        element.closest('[data-reactroot],#__next,#__remix,[data-nextjs-root],[data-remix-root]'),
      );

    const angularLike =
      Boolean(element.closest('[ng-version]')) ||
      element.hasAttribute('formcontrolname') ||
      element.hasAttribute('ng-reflect-name') ||
      element.classList.contains('ng-touched') ||
      element.classList.contains('ng-untouched');

    const vueLike =
      Boolean(element.closest('[data-v-app]')) ||
      Array.from(element.attributes).some(
        (attribute) => attribute.name.startsWith('data-v-') || attribute.name === 'v-model',
      ) ||
      propertyNames.some((property) => property.startsWith('__vue'));

    return { reactLike, angularLike, vueLike };
  }

  private markApplied(element: Element): void {
    if (element instanceof HTMLElement) {
      element.style.outline = '2px solid #0f766e';
      element.style.outlineOffset = '2px';
    }
  }

  private isFillableElement(element: Element | null): element is FillableElement {
    return (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement ||
      (element instanceof HTMLElement && this.isContentEditable(element))
    );
  }

  private isContentEditable(element: Element): element is HTMLElement {
    return (
      element instanceof HTMLElement &&
      (element.isContentEditable || element.getAttribute('contenteditable') === 'true')
    );
  }

  private escapeCss(value: string): string {
    return this.rootDocument.defaultView?.CSS?.escape
      ? this.rootDocument.defaultView.CSS.escape(value)
      : value.replace(/["\\#.:,[\]>+~*^$|= ]/g, '\\$&');
  }

  private rootKey(root: Document | ShadowRoot): string {
    return root instanceof ShadowRoot ? this.elementKey(root.host) : 'document';
  }

  private elementKey(element: Element): string {
    return element.id || element.getAttribute('name') || element.tagName;
  }
}
