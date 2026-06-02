import type { FieldMapping } from '../../core/entities/Mapping';

export type SensitiveFieldCategory =
  | 'password'
  | 'cvv'
  | 'otp'
  | 'mfa'
  | 'ssn'
  | 'aadhaar'
  | 'bankingPin'
  | 'recoveryCode';

export interface AutofillSafetyOptions {
  confirmedSensitiveFieldIds?: readonly string[];
  confirmedSensitiveSelectors?: readonly string[];
  confirmedSensitiveProfileKeys?: readonly string[];
}

export interface SensitiveFieldSignal {
  category: SensitiveFieldCategory;
  reason: string;
  evidence: string[];
}

export interface AutofillSafetyBlock {
  fieldId?: string;
  selector: string;
  profileKey: string;
  categories: SensitiveFieldCategory[];
  reasons: string[];
  evidence: string[];
}

export interface AutofillSafetyDecision {
  allowed: boolean;
  requiresConfirmation: boolean;
  signals: SensitiveFieldSignal[];
  block?: AutofillSafetyBlock;
}

type FillableElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement;

const categoryPriority: SensitiveFieldCategory[] = [
  'password',
  'cvv',
  'otp',
  'mfa',
  'ssn',
  'aadhaar',
  'bankingPin',
  'recoveryCode',
];

export class AutofillSafetyPolicy {
  assess(
    mapping: FieldMapping,
    element: FillableElement,
    options: AutofillSafetyOptions = {},
  ): AutofillSafetyDecision {
    const signals = this.classify(mapping, element);
    if (signals.length === 0) {
      return { allowed: true, requiresConfirmation: false, signals };
    }

    if (this.isExplicitlyConfirmed(mapping, options)) {
      return { allowed: true, requiresConfirmation: false, signals };
    }

    return {
      allowed: false,
      requiresConfirmation: true,
      signals,
      block: this.toBlock(mapping, signals),
    };
  }

  classify(mapping: FieldMapping, element: FillableElement): SensitiveFieldSignal[] {
    const evidence = this.collectEvidence(mapping, element);
    const normalizedEvidence = evidence.map((value) => this.normalize(value));
    const text = normalizedEvidence.join(' ');
    const signals = new Map<SensitiveFieldCategory, SensitiveFieldSignal>();

    const add = (
      category: SensitiveFieldCategory,
      reason: string,
      matchedEvidence: string[] = evidence,
    ): void => {
      if (signals.has(category)) {
        return;
      }
      signals.set(category, {
        category,
        reason,
        evidence: [...new Set(matchedEvidence.filter(Boolean))].slice(0, 8),
      });
    };

    if (element instanceof HTMLInputElement && element.type.toLowerCase() === 'password') {
      add('password', 'Input type is password.', [this.describeElement(element)]);
    }

    if (this.hasAnyPhrase(text, ['current password', 'new password', 'password', 'passcode'])) {
      add('password', 'Field signals indicate a password.');
    }

    if (
      this.hasAnyToken(normalizedEvidence, ['cvv', 'cvc', 'cvn']) ||
      this.hasAnyPhrase(text, [
        'cc csc',
        'card verification',
        'card security code',
        'security code on card',
        'verification value',
      ])
    ) {
      add('cvv', 'Field signals indicate a card verification code.');
    }

    if (
      this.hasAnyToken(normalizedEvidence, ['otp']) ||
      this.hasAnyPhrase(text, [
        'one time password',
        'one time code',
        'sms code',
        'verification code',
      ])
    ) {
      add('otp', 'Field signals indicate a one-time verification code.');
    }

    if (
      this.hasAnyToken(normalizedEvidence, ['mfa', '2fa']) ||
      this.hasAnyPhrase(text, [
        'two factor',
        'multi factor',
        'authentication code',
        'authenticator code',
      ])
    ) {
      add('mfa', 'Field signals indicate a multi-factor authentication code.');
    }

    if (
      this.hasAnyToken(normalizedEvidence, ['ssn']) ||
      this.hasAnyPhrase(text, ['social security number', 'social security'])
    ) {
      add('ssn', 'Field signals indicate a Social Security number.');
    }

    if (
      this.hasAnyToken(normalizedEvidence, ['aadhaar', 'aadhar', 'uidai']) ||
      this.hasAnyPhrase(text, ['aadhaar number', 'aadhar number', 'uidai number'])
    ) {
      add('aadhaar', 'Field signals indicate an Aadhaar identifier.');
    }

    if (
      this.hasAnyPhrase(text, [
        'banking pin',
        'bank pin',
        'atm pin',
        'card pin',
        'credit card pin',
        'debit card pin',
        'debit pin',
        'upi pin',
        'transaction pin',
        'payment pin',
      ])
    ) {
      add('bankingPin', 'Field signals indicate a banking PIN.');
    }

    if (
      this.hasAnyPhrase(text, [
        'recovery code',
        'recovery codes',
        'backup code',
        'backup codes',
        'restore code',
        'emergency code',
      ])
    ) {
      add('recoveryCode', 'Field signals indicate an account recovery code.');
    }

    return categoryPriority
      .map((category) => signals.get(category))
      .filter((signal): signal is SensitiveFieldSignal => Boolean(signal));
  }

  private toBlock(mapping: FieldMapping, signals: SensitiveFieldSignal[]): AutofillSafetyBlock {
    return {
      fieldId: mapping.fieldId,
      selector: mapping.selector,
      profileKey: mapping.profileKey,
      categories: signals.map((signal) => signal.category),
      reasons: signals.map((signal) => signal.reason),
      evidence: [...new Set(signals.flatMap((signal) => signal.evidence))].slice(0, 12),
    };
  }

  private isExplicitlyConfirmed(mapping: FieldMapping, options: AutofillSafetyOptions): boolean {
    return (
      (Boolean(mapping.fieldId) &&
        Boolean(options.confirmedSensitiveFieldIds?.includes(mapping.fieldId as string))) ||
      Boolean(options.confirmedSensitiveSelectors?.includes(mapping.selector)) ||
      Boolean(options.confirmedSensitiveProfileKeys?.includes(mapping.profileKey))
    );
  }

  private collectEvidence(mapping: FieldMapping, element: FillableElement): string[] {
    const attributes = [
      mapping.fieldId,
      mapping.selector,
      mapping.profileKey,
      element.id,
      element.getAttribute('name'),
      element.getAttribute('type'),
      element.getAttribute('autocomplete'),
      element.getAttribute('placeholder'),
      element.getAttribute('aria-label'),
      element.getAttribute('title'),
      element.getAttribute('data-testid'),
      element.getAttribute('data-test'),
      element.getAttribute('data-cy'),
      element.getAttribute('formcontrolname'),
      element.getAttribute('ng-reflect-name'),
    ];
    const labelEvidence = [...this.labelText(element), ...this.ariaLabelledByText(element)].filter(
      Boolean,
    );
    const contextualEvidence =
      labelEvidence.length > 0
        ? []
        : [
            this.previousSiblingText(element),
            this.nextSiblingText(element),
            this.closestLegendText(element),
            this.closestFormText(element),
            this.sectionHeadingText(element),
            this.parentText(element),
          ];

    return [...attributes, ...labelEvidence, ...contextualEvidence]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.trim())
      .filter(Boolean);
  }

  private labelText(element: Element): string[] {
    const labels: string[] = [];
    if (element instanceof HTMLInputElement && element.labels) {
      labels.push(...Array.from(element.labels).map((label) => label.textContent ?? ''));
    }

    const closestLabel = element.closest('label');
    if (closestLabel) {
      labels.push(closestLabel.textContent ?? '');
    }

    const id = element.id;
    if (id) {
      const root = element.getRootNode() as Document | ShadowRoot;
      labels.push(
        ...Array.from(root.querySelectorAll('label[for]'))
          .filter((label) => label.getAttribute('for') === id)
          .map((label) => label.textContent ?? ''),
      );
    }

    return labels;
  }

  private ariaLabelledByText(element: Element): string[] {
    const root = element.getRootNode() as Document | ShadowRoot;
    return (element.getAttribute('aria-labelledby') ?? '')
      .split(/\s+/)
      .map((id) => id.trim())
      .filter(Boolean)
      .map((id) => root.getElementById(id)?.textContent ?? '');
  }

  private previousSiblingText(element: Element): string | undefined {
    return this.textFromNode(element.previousElementSibling);
  }

  private nextSiblingText(element: Element): string | undefined {
    return this.textFromNode(element.nextElementSibling);
  }

  private closestLegendText(element: Element): string | undefined {
    return element.closest('fieldset')?.querySelector('legend')?.textContent ?? undefined;
  }

  private closestFormText(element: Element): string | undefined {
    const form = element.closest('form');
    if (!form) {
      return undefined;
    }

    return [
      form.getAttribute('aria-label'),
      form.getAttribute('title'),
      form.getAttribute('name'),
      form.id,
      form.querySelector('h1,h2,h3,[role="heading"]')?.textContent,
    ]
      .filter(Boolean)
      .join(' ');
  }

  private sectionHeadingText(element: Element): string | undefined {
    let current: Element | null = element;
    for (let depth = 0; current && depth < 4; depth += 1) {
      let sibling = current.previousElementSibling;
      while (sibling) {
        if (this.isHeading(sibling)) {
          return sibling.textContent ?? undefined;
        }
        sibling = sibling.previousElementSibling;
      }
      current = current.parentElement;
    }
    return undefined;
  }

  private parentText(element: Element): string | undefined {
    if (
      !element.parentElement ||
      ['BODY', 'FORM', 'MAIN'].includes(element.parentElement.tagName)
    ) {
      return undefined;
    }

    const text = element.parentElement?.textContent ?? undefined;
    if (!text) {
      return undefined;
    }
    return text.length > 500 ? `${text.slice(0, 500)} ` : text;
  }

  private textFromNode(node: Element | null): string | undefined {
    return node?.textContent ?? undefined;
  }

  private isHeading(element: Element): boolean {
    return /H[1-6]/.test(element.tagName) || element.getAttribute('role') === 'heading';
  }

  private describeElement(element: Element): string {
    return [
      element.tagName.toLowerCase(),
      element.id ? `#${element.id}` : '',
      element.getAttribute('name') ? `[name="${element.getAttribute('name')}"]` : '',
      element.getAttribute('type') ? `[type="${element.getAttribute('type')}"]` : '',
    ].join('');
  }

  private hasAnyToken(values: string[], terms: string[]): boolean {
    return values.some((value) => {
      const tokens = value.split(' ');
      return terms.some((term) => tokens.includes(this.normalize(term)));
    });
  }

  private hasAnyPhrase(value: string, phrases: string[]): boolean {
    return phrases.some((phrase) => value.includes(this.normalize(phrase)));
  }

  private normalize(value: string): string {
    return value
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
