export interface DomFieldSignal {
  selector: string;
  tagName: 'input' | 'select' | 'textarea';
  type?: string;
  name?: string;
  id?: string;
  label?: string;
  placeholder?: string;
  autocomplete?: string;
  ariaLabel?: string;
}

export interface FieldMapping {
  selector: string;
  profileKey: string;
  confidence: number;
  reason: string;
}

export interface MappingRequest {
  fields: DomFieldSignal[];
  profileAttributes: Record<string, string | number | boolean>;
  minConfidence: number;
}
