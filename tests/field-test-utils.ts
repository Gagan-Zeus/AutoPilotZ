import type { DomFieldSignal } from '../src/core/entities/Mapping';

export const field = (overrides: Partial<DomFieldSignal>): DomFieldSignal => ({
  fieldId: overrides.selector ?? '#field',
  kind: 'input',
  selector: overrides.selector ?? '#field',
  selectors: [overrides.selector ?? '#field'],
  tagName: 'input',
  required: false,
  disabled: false,
  readOnly: false,
  multiple: false,
  validationRules: [],
  options: [],
  context: {
    pageTitle: 'Test page',
    urlPath: '/test',
  },
  confidence: 0.5,
  frameworkHints: { react: false, angular: false, vue: false },
  shadowDom: false,
  ...overrides,
});
