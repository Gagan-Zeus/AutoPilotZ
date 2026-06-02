import type {
  FieldExtractionContext,
  FieldExtractionResult,
  FormControlKind,
  FormOption,
  FrameworkHints,
  NormalizedFormExtraction,
  NormalizedFormField,
  NormalizedFormSection,
  ValidationRule,
} from '../../core/entities/FormExtraction';

type ExtractableElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLElement;

interface TraversedElement {
  element: Element;
  shadowDom: boolean;
}

interface FieldGroup {
  kind: 'radio-group' | 'checkbox-group';
  key: string;
  controls: HTMLInputElement[];
}

const fieldSelector = [
  'input',
  'select',
  'textarea',
  '[contenteditable]:not([contenteditable="false"])',
].join(',');

const labelSelector = 'label, [aria-label], [aria-labelledby]';
const sectionSelector = 'h1,h2,h3,h4,h5,h6,legend,[role="heading"]';
const maxTextLength = 160;

export class FormExtractionEngine {
  private observer?: MutationObserver;
  private readonly shadowRootObservers = new Map<ShadowRoot, MutationObserver>();
  private originalAttachShadow?: typeof Element.prototype.attachShadow;
  private version = 0;

  constructor(private readonly rootDocument: Document = document) {}

  extract(): NormalizedFormExtraction {
    const traversed = this.traverseComposedTree();
    const controls = traversed
      .filter((item) => item.element.matches(fieldSelector))
      .map((item) => ({
        element: item.element as ExtractableElement,
        shadowDom: item.shadowDom,
      }))
      .filter((item) => this.isSupportedControl(item.element))
      .filter((item) => this.isVisible(item.element));

    const groupedInputs = this.groupChoiceInputs(
      controls
        .map((item) => item.element)
        .filter((element): element is HTMLInputElement => element instanceof HTMLInputElement)
        .filter((element) => element.type === 'radio' || element.type === 'checkbox'),
    );
    const groupedElements = new Set(groupedInputs.flatMap((group) => group.controls));
    const fields: NormalizedFormField[] = [];

    for (const group of groupedInputs) {
      fields.push(this.extractChoiceGroup(group));
    }

    for (const item of controls) {
      if (groupedElements.has(item.element as HTMLInputElement)) {
        continue;
      }
      fields.push(this.extractSingleControl(item.element, item.shadowDom));
    }

    const sections = this.extractSections(fields);

    return {
      schemaVersion: 1,
      url: this.rootDocument.location.href,
      title: this.rootDocument.title,
      extractedAt: new Date().toISOString(),
      fields,
      fieldContexts: fields.map((field) => this.toFieldExtractionResult(field)),
      sections,
      stats: {
        forms: new Set(
          fields
            .map((field) => field.form?.selector)
            .filter((selector): selector is string => !!selector),
        ).size,
        fields: fields.length,
        shadowRoots: this.countShadowRoots(traversed),
        radioGroups: fields.filter((field) => field.kind === 'radio-group').length,
        checkboxGroups: fields.filter((field) => field.kind === 'checkbox-group').length,
      },
    };
  }

  startObserving(onChange?: () => void): () => void {
    this.stopObserving();
    this.patchAttachShadow(onChange);
    this.observer = this.createMutationObserver(onChange);
    this.observer.observe(this.rootDocument.documentElement, this.observerOptions());
    this.observeDiscoveredShadowRoots(this.rootDocument, onChange);

    return () => this.stopObserving();
  }

  stopObserving(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    for (const observer of this.shadowRootObservers.values()) {
      observer.disconnect();
    }
    this.shadowRootObservers.clear();
    this.restoreAttachShadow();
  }

  getVersion(): number {
    return this.version;
  }

  private createMutationObserver(onChange?: () => void): MutationObserver {
    return new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        this.observeShadowRootsFromMutation(mutation, onChange);
      }

      if (mutations.some((mutation) => this.mutationCanAffectForms(mutation))) {
        this.version += 1;
        onChange?.();
      }
    });
  }

  private observerOptions(): MutationObserverInit {
    return {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        'id',
        'name',
        'type',
        'placeholder',
        'aria-label',
        'aria-labelledby',
        'aria-required',
        'autocomplete',
        'required',
        'pattern',
        'min',
        'max',
        'minlength',
        'maxlength',
        'contenteditable',
        'formcontrolname',
        'ng-reflect-name',
        'ng-reflect-required',
      ],
    };
  }

  private observeDiscoveredShadowRoots(root: ParentNode, onChange?: () => void): void {
    for (const element of Array.from(root.children)) {
      const shadowRoot = this.openShadowRoot(element);
      if (shadowRoot) {
        this.observeShadowRoot(shadowRoot, onChange);
        this.observeDiscoveredShadowRoots(shadowRoot, onChange);
      }
      this.observeDiscoveredShadowRoots(element, onChange);
    }
  }

  private observeShadowRoot(shadowRoot: ShadowRoot, onChange?: () => void): void {
    if (this.shadowRootObservers.has(shadowRoot)) {
      return;
    }

    const observer = this.createMutationObserver(onChange);
    observer.observe(shadowRoot, this.observerOptions());
    this.shadowRootObservers.set(shadowRoot, observer);
  }

  private observeShadowRootsFromMutation(mutation: MutationRecord, onChange?: () => void): void {
    if (mutation.type === 'attributes' && mutation.target instanceof Element) {
      const shadowRoot = this.openShadowRoot(mutation.target);
      if (shadowRoot) {
        this.observeShadowRoot(shadowRoot, onChange);
      }
    }

    for (const node of Array.from(mutation.addedNodes)) {
      if (node instanceof Element) {
        const shadowRoot = this.openShadowRoot(node);
        if (shadowRoot) {
          this.observeShadowRoot(shadowRoot, onChange);
          this.observeDiscoveredShadowRoots(shadowRoot, onChange);
        }
        this.observeDiscoveredShadowRoots(node, onChange);
      }
    }
  }

  private patchAttachShadow(onChange?: () => void): void {
    if (this.originalAttachShadow || typeof Element === 'undefined') {
      return;
    }

    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'attachShadow');
    if (!descriptor || typeof descriptor.value !== 'function') {
      return;
    }

    const originalAttachShadow = descriptor.value as typeof Element.prototype.attachShadow;
    this.originalAttachShadow = originalAttachShadow;
    const observeShadowRoot = (shadowRoot: ShadowRoot) =>
      this.observeShadowRoot(shadowRoot, onChange);
    const notifyChange = () => {
      this.version += 1;
      onChange?.();
    };

    Element.prototype.attachShadow = function attachShadow(
      this: Element,
      init: ShadowRootInit,
    ): ShadowRoot {
      const shadowRoot = originalAttachShadow.call(this, init);
      if (init.mode === 'open') {
        observeShadowRoot(shadowRoot);
        notifyChange();
      }
      return shadowRoot;
    };
  }

  private restoreAttachShadow(): void {
    if (this.originalAttachShadow && typeof Element !== 'undefined') {
      Element.prototype.attachShadow = this.originalAttachShadow;
      this.originalAttachShadow = undefined;
    }
  }

  private extractSingleControl(
    element: ExtractableElement,
    shadowDom: boolean,
  ): NormalizedFormField {
    const tagName = this.normalizedTagName(element);
    const selector = this.stableSelector(element);
    const validationRules = this.extractValidationRules(element);
    const required = validationRules.some(
      (rule) => rule.name === 'required' && rule.value !== false,
    );
    const label = this.findLabel(element);
    const sectionHeading = this.findSectionHeading(element);
    const context = this.buildContext(element, label, sectionHeading);

    const field: NormalizedFormField = {
      fieldId: this.fieldId(element, selector),
      kind: this.kindForControl(element),
      selector,
      selectors: [selector],
      tagName,
      type: element instanceof HTMLInputElement ? element.type : undefined,
      id: element.id || undefined,
      name: this.getAttribute(element, 'name'),
      placeholder: this.getAttribute(element, 'placeholder'),
      label,
      ariaLabel: this.getAriaLabel(element),
      autocomplete: this.getAttribute(element, 'autocomplete'),
      nearbyText: this.findNearbyText(element),
      sectionHeading,
      context,
      confidence: 0,
      required,
      disabled: this.isDisabled(element),
      readOnly: this.isReadOnly(element),
      multiple: element instanceof HTMLSelectElement ? element.multiple : false,
      validationRules,
      options: this.extractOptions(element),
      form: this.extractFormMetadata(element),
      frameworkHints: this.detectFrameworkHints(element),
      shadowDom,
    };
    return { ...field, confidence: this.calculateConfidence(field) };
  }

  private extractChoiceGroup(group: FieldGroup): NormalizedFormField {
    const firstControl = group.controls[0];
    if (!firstControl) {
      throw new Error('Cannot extract an empty field group.');
    }
    const selector = this.groupSelector(group);
    const validationRules = this.mergeValidationRules(group.controls);
    const options = group.controls.map((control) => this.extractChoiceOption(control));
    const required =
      options.some((option) => option.required) ||
      validationRules.some((rule) => rule.name === 'required' && rule.value !== false);
    const label = this.findGroupLabel(firstControl) ?? this.findLabel(firstControl);
    const sectionHeading = this.findSectionHeading(firstControl);
    const context = this.buildContext(firstControl, label, sectionHeading);

    const field: NormalizedFormField = {
      fieldId: `group:${group.kind}:${group.key}`,
      kind: group.kind,
      selector,
      selectors: group.controls.map((control) => this.stableSelector(control)),
      tagName: 'input',
      type: firstControl.type,
      id: firstControl.id || undefined,
      name: firstControl.name || undefined,
      placeholder: undefined,
      label,
      ariaLabel: this.getAriaLabel(firstControl),
      autocomplete: this.getAttribute(firstControl, 'autocomplete'),
      nearbyText: this.findNearbyText(firstControl),
      sectionHeading,
      context,
      confidence: 0,
      required,
      disabled: group.controls.every((control) => control.disabled),
      readOnly: false,
      multiple: group.kind === 'checkbox-group',
      validationRules,
      options,
      form: this.extractFormMetadata(firstControl),
      frameworkHints: this.mergeFrameworkHints(group.controls),
      shadowDom: group.controls.some((control) => control.getRootNode() instanceof ShadowRoot),
    };
    return { ...field, confidence: this.calculateConfidence(field) };
  }

  private traverseComposedTree(): TraversedElement[] {
    const result: TraversedElement[] = [];
    const visit = (root: ParentNode, shadowDom: boolean) => {
      for (const element of Array.from(root.children)) {
        result.push({ element, shadowDom });
        const shadowRoot = this.openShadowRoot(element);
        if (shadowRoot) {
          visit(shadowRoot, true);
        }
        visit(element, shadowDom);
      }
    };

    visit(this.rootDocument.documentElement, false);
    return result;
  }

  private groupChoiceInputs(inputs: HTMLInputElement[]): FieldGroup[] {
    const groups = new Map<string, FieldGroup>();
    for (const input of inputs) {
      const kind = input.type === 'radio' ? 'radio-group' : 'checkbox-group';
      const key = this.choiceGroupKey(input, kind);
      const existing = groups.get(key);
      if (existing) {
        existing.controls.push(input);
      } else {
        groups.set(key, { kind, key, controls: [input] });
      }
    }

    return [...groups.values()];
  }

  private choiceGroupKey(input: HTMLInputElement, kind: FieldGroup['kind']): string {
    const formSelector = input.form ? this.stableSelector(input.form) : 'no-form';
    const rootNode = input.getRootNode();
    const rootKey = this.isShadowRoot(rootNode) ? this.stableSelector(rootNode.host) : 'document';
    return `${rootKey}:${formSelector}:${kind}:${input.name || this.stableSelector(input)}`;
  }

  private extractValidationRules(element: ExtractableElement): ValidationRule[] {
    const rules: ValidationRule[] = [];
    const nativeAttributes = [
      'required',
      'pattern',
      'min',
      'max',
      'minlength',
      'maxlength',
      'step',
      'inputmode',
    ];

    for (const attribute of nativeAttributes) {
      if (element.hasAttribute(attribute)) {
        rules.push({
          name: attribute,
          value: this.attributeRuleValue(element, attribute),
          source: 'native',
        });
      }
    }

    if (element instanceof HTMLInputElement && element.type && element.type !== 'text') {
      rules.push({ name: 'type', value: element.type, source: 'native' });
    }

    const ariaRequired = element.getAttribute('aria-required');
    if (ariaRequired === 'true') {
      rules.push({ name: 'required', value: true, source: 'aria' });
    }

    const ariaInvalid = element.getAttribute('aria-invalid');
    if (ariaInvalid && ariaInvalid !== 'false') {
      rules.push({ name: 'invalid', value: ariaInvalid, source: 'aria' });
    }

    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name.startsWith('ng-reflect-')) {
        rules.push({
          name: attribute.name.replace('ng-reflect-', ''),
          value: attribute.value,
          source: 'angular',
        });
      }
      if (attribute.name.startsWith('data-vv-')) {
        rules.push({
          name: attribute.name.replace('data-vv-', ''),
          value: attribute.value || true,
          source: 'vue',
        });
      }
    }

    if (element.classList.contains('ng-invalid')) {
      rules.push({ name: 'invalid', value: true, source: 'angular' });
    }

    if (element.hasAttribute('data-react-checksum') || element.hasAttribute('data-reactroot')) {
      rules.push({ name: 'controlled', value: true, source: 'react' });
    }

    return this.dedupeRules(rules);
  }

  private mergeValidationRules(elements: ExtractableElement[]): ValidationRule[] {
    return this.dedupeRules(elements.flatMap((element) => this.extractValidationRules(element)));
  }

  private extractChoiceOption(control: HTMLInputElement): FormOption {
    return {
      selector: this.stableSelector(control),
      id: control.id || undefined,
      name: control.name || undefined,
      value: control.value || undefined,
      label: this.findLabel(control) ?? this.findNearbyText(control),
      checked: control.checked,
      required: control.required || control.getAttribute('aria-required') === 'true',
      disabled: control.disabled,
    };
  }

  private extractOptions(element: ExtractableElement): FormOption[] {
    if (element instanceof HTMLSelectElement) {
      return Array.from(element.options).map((option) => ({
        selector: `${this.stableSelector(element)} option[value="${this.escapeCss(option.value)}"]`,
        value: option.value,
        label: this.cleanText(option.label || option.textContent),
        checked: option.selected,
        required: element.required,
        disabled: option.disabled,
      }));
    }

    return [];
  }

  private findLabel(element: Element): string | undefined {
    const ariaLabelledBy = element.getAttribute('aria-labelledby');
    if (ariaLabelledBy) {
      const root = element.getRootNode() as Document | ShadowRoot;
      const label = ariaLabelledBy
        .split(/\s+/)
        .map((id) => root.getElementById?.(id)?.textContent)
        .map((text) => this.cleanText(text))
        .filter(Boolean)
        .join(' ');
      if (label) {
        return label;
      }
    }

    if (element.id) {
      const root = element.getRootNode() as Document | ShadowRoot;
      const label = root.querySelector<HTMLLabelElement>(
        `label[for="${this.escapeCss(element.id)}"]`,
      );
      if (label?.textContent?.trim()) {
        return this.cleanText(label.textContent);
      }
    }

    const wrappingLabel = element.closest('label');
    if (wrappingLabel?.textContent?.trim()) {
      return this.cleanText(wrappingLabel.textContent);
    }

    const labelledAncestor = element.closest(labelSelector);
    if (labelledAncestor?.textContent?.trim()) {
      return this.cleanText(labelledAncestor.textContent);
    }

    return undefined;
  }

  private findGroupLabel(element: Element): string | undefined {
    const fieldset = element.closest('fieldset');
    const legend = fieldset?.querySelector('legend');
    if (legend?.textContent?.trim()) {
      return this.cleanText(legend.textContent);
    }

    const group = element.closest('[role="radiogroup"], [role="group"]');
    if (group) {
      const ariaLabel = group.getAttribute('aria-label');
      if (ariaLabel) {
        return this.cleanText(ariaLabel);
      }
      const labelledBy = group.getAttribute('aria-labelledby');
      if (labelledBy) {
        const root = group.getRootNode() as Document | ShadowRoot;
        const text = labelledBy
          .split(/\s+/)
          .map((id) => root.getElementById?.(id)?.textContent)
          .join(' ');
        return this.cleanText(text);
      }
    }

    return undefined;
  }

  private getAriaLabel(element: Element): string | undefined {
    return this.cleanText(element.getAttribute('aria-label'));
  }

  private findNearbyText(element: Element): string | undefined {
    const candidates: string[] = [];
    const previous = element.previousElementSibling;
    const next = element.nextElementSibling;
    if (previous) {
      candidates.push(this.cleanText(previous.textContent) ?? '');
    }
    if (
      next?.matches('small,.hint,.help,[class*="hint"],[class*="help"],[id*="hint"],[id*="help"]')
    ) {
      candidates.push(this.cleanText(next.textContent) ?? '');
    }

    const parent = element.parentElement;
    if (parent) {
      const parentClone = parent.cloneNode(true) as HTMLElement;
      parentClone
        .querySelectorAll('input,select,textarea,button,[contenteditable]')
        .forEach((node) => node.remove());
      candidates.push(this.cleanText(parentClone.textContent) ?? '');
    }

    const describedBy = element.getAttribute('aria-describedby');
    if (describedBy) {
      const root = element.getRootNode() as Document | ShadowRoot;
      candidates.push(
        describedBy
          .split(/\s+/)
          .map((id) => root.getElementById?.(id)?.textContent)
          .join(' '),
      );
    }

    return this.cleanText(candidates.filter(Boolean).join(' '));
  }

  private buildContext(
    element: Element,
    labelText: string | undefined,
    sectionTitle: string | undefined,
  ): FieldExtractionContext {
    return {
      labelText,
      surroundingText: this.findSurroundingText(element),
      previousSiblingText: this.findSiblingText(element, 'previous'),
      nextSiblingText: this.findSiblingText(element, 'next'),
      formTitle: this.findFormTitle(element),
      pageTitle: this.rootDocument.title,
      urlPath: this.rootDocument.location.pathname,
      sectionTitle,
    };
  }

  private toFieldExtractionResult(field: NormalizedFormField): FieldExtractionResult {
    return {
      fieldId: field.fieldId,
      type: this.exposedFieldType(field),
      label: field.label,
      context: field.context,
      confidence: field.confidence,
    };
  }

  private exposedFieldType(field: NormalizedFormField): string {
    if (field.kind === 'input' && field.type) {
      return field.type;
    }
    return field.kind;
  }

  private calculateConfidence(field: NormalizedFormField): number {
    let score = 0.12;

    if (field.label) score += 0.25;
    if (field.ariaLabel) score += 0.12;
    if (field.name) score += 0.1;
    if (field.id) score += 0.08;
    if (field.placeholder) score += 0.08;
    if (field.autocomplete) score += 0.12;
    if (field.context.previousSiblingText) score += 0.05;
    if (field.context.nextSiblingText) score += 0.04;
    if (field.context.surroundingText) score += 0.06;
    if (field.context.formTitle) score += 0.04;
    if (field.context.sectionTitle) score += 0.06;
    if (field.validationRules.length > 0) score += 0.03;
    if (field.options.length > 0) score += 0.04;

    return Math.min(1, Number(score.toFixed(2)));
  }

  private findSiblingText(element: Element, direction: 'previous' | 'next'): string | undefined {
    const sibling =
      direction === 'previous' ? element.previousElementSibling : element.nextElementSibling;
    if (sibling?.textContent?.trim()) {
      return this.cleanText(sibling.textContent);
    }

    const parentSibling =
      direction === 'previous'
        ? element.parentElement?.previousElementSibling
        : element.parentElement?.nextElementSibling;
    if (parentSibling?.textContent?.trim()) {
      return this.cleanText(parentSibling.textContent);
    }

    return undefined;
  }

  private findSurroundingText(element: Element): string | undefined {
    const container =
      element.closest(
        'label,fieldset,[role="group"],[role="radiogroup"],.form-group,.field,.control',
      ) ?? element.parentElement;
    if (!container) {
      return undefined;
    }

    const clone = container.cloneNode(true) as HTMLElement;
    clone
      .querySelectorAll('input,select,textarea,button,[contenteditable],script,style')
      .forEach((node) => node.remove());
    return this.cleanText(clone.textContent);
  }

  private findFormTitle(element: Element): string | undefined {
    const form = element.closest('form');
    if (!form) {
      return this.findSectionHeading(element);
    }

    const ariaLabel = form.getAttribute('aria-label');
    if (ariaLabel) {
      return this.cleanText(ariaLabel);
    }

    const labelledBy = form.getAttribute('aria-labelledby');
    if (labelledBy) {
      const root = form.getRootNode() as Document | ShadowRoot;
      const text = labelledBy
        .split(/\s+/)
        .map((id) => root.getElementById?.(id)?.textContent)
        .join(' ');
      const cleaned = this.cleanText(text);
      if (cleaned) {
        return cleaned;
      }
    }

    const innerTitle = form.querySelector(sectionSelector);
    if (innerTitle?.textContent?.trim()) {
      return this.cleanText(innerTitle.textContent);
    }

    const precedingTitle = this.findPrecedingHeading(form);
    if (precedingTitle) {
      return precedingTitle;
    }

    return this.cleanText(form.getAttribute('name') ?? form.id);
  }

  private findSectionHeading(element: Element): string | undefined {
    const fieldsetLegend = element.closest('fieldset')?.querySelector('legend');
    if (fieldsetLegend?.textContent?.trim()) {
      return this.cleanText(fieldsetLegend.textContent);
    }

    let current: Element | null = element;
    while (current && current !== this.rootDocument.body) {
      const heading = this.findPrecedingHeading(current);
      if (heading) {
        return heading;
      }
      current = current.parentElement;
    }

    return undefined;
  }

  private findPrecedingHeading(element: Element): string | undefined {
    let sibling = element.previousElementSibling;
    while (sibling) {
      if (sibling.matches(sectionSelector)) {
        return this.cleanText(sibling.textContent);
      }
      const nestedHeading = sibling.querySelector(sectionSelector);
      if (nestedHeading?.textContent?.trim()) {
        return this.cleanText(nestedHeading.textContent);
      }
      sibling = sibling.previousElementSibling;
    }
    return undefined;
  }

  private extractFormMetadata(element: ExtractableElement): NormalizedFormField['form'] {
    const form =
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement
        ? element.form
        : element.closest('form');
    if (!form) {
      return undefined;
    }

    return {
      selector: this.stableSelector(form),
      id: form.id || undefined,
      name: form.getAttribute('name') ?? undefined,
      action: form.getAttribute('action') ?? undefined,
      method: form.getAttribute('method') ?? undefined,
    };
  }

  private extractSections(fields: NormalizedFormField[]): NormalizedFormSection[] {
    const sections = new Map<string, NormalizedFormSection>();
    for (const field of fields) {
      const key = field.sectionHeading || 'Unsectioned';
      const section = sections.get(key) ?? {
        heading: field.sectionHeading,
        fields: [],
      };
      section.fields.push(field.fieldId);
      sections.set(key, section);
    }
    return [...sections.values()];
  }

  private stableSelector(element: Element): string {
    const root = element.getRootNode();
    const localSelector = this.localStableSelector(element);
    if (root instanceof ShadowRoot) {
      return `${this.stableSelector(root.host)} >>> ${localSelector}`;
    }
    return localSelector;
  }

  private localStableSelector(element: Element): string {
    if (element.id) {
      return `#${this.escapeCss(element.id)}`;
    }

    const name = element.getAttribute('name');
    if (name) {
      return `${element.tagName.toLowerCase()}[name="${this.escapeCss(name)}"]`;
    }

    const dataTestId = element.getAttribute('data-testid') ?? element.getAttribute('data-test');
    if (dataTestId) {
      return `${element.tagName.toLowerCase()}[data-testid="${this.escapeCss(dataTestId)}"]`;
    }

    const segments: string[] = [];
    let current: Element | null = element;
    while (
      current &&
      current !== this.rootDocument.body &&
      !(this.isShadowRoot(current.getRootNode()) && current.parentElement === null)
    ) {
      const parentElement: Element | null = current.parentElement;
      if (!parentElement) {
        break;
      }
      const currentTagName = current.tagName;
      const siblings = Array.from(parentElement.children).filter(
        (child) => child.tagName === currentTagName,
      );
      const index = siblings.indexOf(current) + 1;
      segments.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${index})`);
      current = parentElement;
    }

    return segments.join(' > ');
  }

  private groupSelector(group: FieldGroup): string {
    return this.stableSelector(group.controls[0]);
  }

  private fieldId(element: Element, selector: string): string {
    const parts = [
      this.kindForControl(element as ExtractableElement),
      element.id,
      element.getAttribute('name'),
      selector,
    ].filter(Boolean);
    return parts.join(':');
  }

  private kindForControl(element: ExtractableElement): FormControlKind {
    if (this.isContentEditable(element)) {
      return 'contenteditable';
    }
    if (element instanceof HTMLSelectElement) {
      return 'select';
    }
    if (element instanceof HTMLTextAreaElement) {
      return 'textarea';
    }
    return 'input';
  }

  private normalizedTagName(element: ExtractableElement): NormalizedFormField['tagName'] {
    if (this.isContentEditable(element)) {
      return 'contenteditable';
    }
    return element.tagName.toLowerCase() as NormalizedFormField['tagName'];
  }

  private isSupportedControl(element: ExtractableElement): boolean {
    if (element instanceof HTMLInputElement) {
      return element.type !== 'hidden';
    }
    return (
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement ||
      this.isContentEditable(element)
    );
  }

  private isVisible(element: Element): boolean {
    if (element.hasAttribute('hidden')) {
      return false;
    }
    const style = this.rootDocument.defaultView?.getComputedStyle(element);
    if (style?.display === 'none' || style?.visibility === 'hidden') {
      return false;
    }
    return true;
  }

  private isDisabled(element: ExtractableElement): boolean {
    return 'disabled' in element
      ? Boolean(element.disabled)
      : element.getAttribute('aria-disabled') === 'true';
  }

  private isReadOnly(element: ExtractableElement): boolean {
    return 'readOnly' in element
      ? Boolean(element.readOnly)
      : element.getAttribute('aria-readonly') === 'true';
  }

  private isContentEditable(element: Element): boolean {
    return (
      element instanceof HTMLElement &&
      (element.isContentEditable || element.getAttribute('contenteditable') === 'true')
    );
  }

  private isShadowRoot(root: Node): root is ShadowRoot {
    return typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot;
  }

  private detectFrameworkHints(element: Element): FrameworkHints {
    const attributeNames = Array.from(element.attributes).map((attribute) => attribute.name);
    const ancestor = element.closest('[ng-version],[data-reactroot],[data-v-app],[v-cloak]');
    const propertyNames = Object.keys(element as unknown as Record<string, unknown>);

    return {
      react:
        !!ancestor?.hasAttribute('data-reactroot') ||
        propertyNames.some(
          (property) =>
            property.startsWith('__reactFiber$') || property.startsWith('__reactProps$'),
        ),
      angular:
        !!ancestor?.hasAttribute('ng-version') ||
        attributeNames.some(
          (attribute) =>
            attribute.startsWith('ng-') ||
            attribute.startsWith('ng-reflect-') ||
            attribute === 'formcontrolname',
        ) ||
        element.classList.contains('ng-touched') ||
        element.classList.contains('ng-untouched'),
      vue:
        !!ancestor?.hasAttribute('data-v-app') ||
        attributeNames.some(
          (attribute) => attribute.startsWith('data-v-') || attribute === 'v-model',
        ) ||
        propertyNames.some((property) => property.startsWith('__vue')),
    };
  }

  private mergeFrameworkHints(elements: Element[]): FrameworkHints {
    return elements
      .map((element) => this.detectFrameworkHints(element))
      .reduce(
        (merged, hints) => ({
          react: merged.react || hints.react,
          angular: merged.angular || hints.angular,
          vue: merged.vue || hints.vue,
        }),
        { react: false, angular: false, vue: false },
      );
  }

  private mutationCanAffectForms(mutation: MutationRecord): boolean {
    if (mutation.type === 'attributes') {
      return mutation.target instanceof Element && mutation.target.matches(fieldSelector);
    }

    return Array.from(mutation.addedNodes).some(
      (node) =>
        node instanceof Element &&
        (node.matches(fieldSelector) ||
          Boolean(node.querySelector(fieldSelector)) ||
          Boolean(this.openShadowRoot(node)?.querySelector(fieldSelector))),
    );
  }

  private countShadowRoots(elements: TraversedElement[]): number {
    return elements.filter((item) => this.openShadowRoot(item.element)).length;
  }

  private openShadowRoot(element: Element): ShadowRoot | null {
    return element instanceof HTMLElement && element.shadowRoot ? element.shadowRoot : null;
  }

  private getAttribute(element: Element, name: string): string | undefined {
    return this.cleanText(element.getAttribute(name));
  }

  private attributeRuleValue(element: Element, attribute: string): string | number | boolean {
    if (attribute === 'required') {
      return true;
    }

    const value = element.getAttribute(attribute);
    if (value === null || value === '') {
      return true;
    }

    const numeric = Number(value);
    return Number.isFinite(numeric) &&
      ['min', 'max', 'minlength', 'maxlength', 'step'].includes(attribute)
      ? numeric
      : value;
  }

  private dedupeRules(rules: ValidationRule[]): ValidationRule[] {
    const deduped = new Map<string, ValidationRule>();
    for (const rule of rules) {
      deduped.set(`${rule.source}:${rule.name}:${String(rule.value)}`, rule);
    }
    return [...deduped.values()];
  }

  private cleanText(value: string | null | undefined): string | undefined {
    const cleaned = value?.replace(/\s+/g, ' ').trim();
    if (!cleaned) {
      return undefined;
    }
    return cleaned.length > maxTextLength ? `${cleaned.slice(0, maxTextLength - 1)}...` : cleaned;
  }

  private escapeCss(value: string): string {
    return this.rootDocument.defaultView?.CSS?.escape
      ? this.rootDocument.defaultView.CSS.escape(value)
      : value.replace(/["\\#.:,[\]>+~*^$|= ]/g, '\\$&');
  }
}
