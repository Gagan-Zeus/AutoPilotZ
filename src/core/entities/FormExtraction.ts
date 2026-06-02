export type FormControlKind =
  | 'input'
  | 'select'
  | 'textarea'
  | 'contenteditable'
  | 'radio-group'
  | 'checkbox-group';

export interface ValidationRule {
  name: string;
  value?: string | number | boolean;
  source: 'native' | 'aria' | 'angular' | 'vue' | 'react' | 'inferred';
}

export interface FormOption {
  selector: string;
  id?: string;
  name?: string;
  value?: string;
  label?: string;
  checked?: boolean;
  required: boolean;
  disabled: boolean;
}

export interface FrameworkHints {
  react: boolean;
  angular: boolean;
  vue: boolean;
}

export interface NormalizedFormField {
  fieldId: string;
  kind: FormControlKind;
  selector: string;
  selectors: string[];
  tagName: 'input' | 'select' | 'textarea' | 'contenteditable';
  type?: string;
  id?: string;
  name?: string;
  placeholder?: string;
  label?: string;
  ariaLabel?: string;
  autocomplete?: string;
  nearbyText?: string;
  sectionHeading?: string;
  required: boolean;
  disabled: boolean;
  readOnly: boolean;
  multiple: boolean;
  validationRules: ValidationRule[];
  options: FormOption[];
  form?: {
    selector?: string;
    id?: string;
    name?: string;
    action?: string;
    method?: string;
  };
  frameworkHints: FrameworkHints;
  shadowDom: boolean;
}

export interface NormalizedFormSection {
  heading?: string;
  fields: string[];
}

export interface NormalizedFormExtraction {
  schemaVersion: 1;
  url: string;
  title: string;
  extractedAt: string;
  fields: NormalizedFormField[];
  sections: NormalizedFormSection[];
  stats: {
    forms: number;
    fields: number;
    shadowRoots: number;
    radioGroups: number;
    checkboxGroups: number;
  };
}
