import type { DomFieldSignal, FieldMapping, MappingRequest } from '../../core/entities/Mapping';
import type { MappingModel } from '../../core/ports/MappingModel';

const synonymMap: Record<string, string[]> = {
  email: ['email', 'e-mail', 'mail'],
  firstName: ['first', 'given', 'fname', 'forename'],
  lastName: ['last', 'family', 'lname', 'surname'],
  fullName: ['name', 'full name', 'contact name'],
  phone: ['phone', 'mobile', 'tel', 'telephone'],
  company: ['company', 'organization', 'employer', 'business'],
  title: ['title', 'role', 'position', 'job'],
  address: ['address', 'street', 'line1'],
  city: ['city', 'town', 'locality'],
  state: ['state', 'province', 'region'],
  postalCode: ['zip', 'postal', 'postcode'],
  country: ['country', 'nation'],
  website: ['website', 'url', 'homepage', 'site'],
};

export class HeuristicAiMappingEngine implements MappingModel {
  mapFields(request: MappingRequest): Promise<FieldMapping[]> {
    const profileKeys = Object.keys(request.profileAttributes);
    const mappings = request.fields
      .map((field) => this.bestMappingForField(field, profileKeys))
      .filter((mapping): mapping is FieldMapping => mapping !== null)
      .filter((mapping) => mapping.confidence >= request.minConfidence);

    return Promise.resolve(this.dedupeBySelector(mappings));
  }

  private bestMappingForField(field: DomFieldSignal, profileKeys: string[]): FieldMapping | null {
    const fieldText = this.normalize(
      [
        field.autocomplete,
        field.name,
        field.id,
        field.label,
        field.placeholder,
        field.ariaLabel,
        field.type,
      ].join(' '),
    );

    let best: FieldMapping | null = null;
    for (const profileKey of profileKeys) {
      const score = this.score(fieldText, profileKey);
      if (!best || score.confidence > best.confidence) {
        best = {
          selector: field.selector,
          profileKey,
          confidence: score.confidence,
          reason: score.reason,
        };
      }
    }

    return best && best.confidence > 0 ? best : null;
  }

  private score(fieldText: string, profileKey: string): { confidence: number; reason: string } {
    const normalizedKey = this.normalize(profileKey);
    if (!fieldText || !normalizedKey) {
      return { confidence: 0, reason: 'No comparable field signals.' };
    }

    if (fieldText.includes(normalizedKey)) {
      return { confidence: 0.96, reason: `Direct match for ${profileKey}.` };
    }

    const synonyms = synonymMap[profileKey] ?? synonymMap[normalizedKey] ?? [];
    const matchedSynonym = synonyms.find((synonym) => fieldText.includes(this.normalize(synonym)));
    if (matchedSynonym) {
      return { confidence: 0.88, reason: `Matched ${matchedSynonym} synonym.` };
    }

    const keyTokens = this.tokenize(normalizedKey);
    const fieldTokens = this.tokenize(fieldText);
    const overlap = keyTokens.filter((token) => fieldTokens.includes(token)).length;
    if (overlap > 0) {
      const confidence = Math.min(0.82, 0.5 + overlap / Math.max(keyTokens.length, 1) / 2);
      return { confidence, reason: `Token overlap with ${profileKey}.` };
    }

    return { confidence: 0, reason: 'No semantic match.' };
  }

  private dedupeBySelector(mappings: FieldMapping[]): FieldMapping[] {
    const selected = new Map<string, FieldMapping>();
    for (const mapping of mappings) {
      const existing = selected.get(mapping.selector);
      if (!existing || mapping.confidence > existing.confidence) {
        selected.set(mapping.selector, mapping);
      }
    }
    return [...selected.values()];
  }

  private normalize(value: string): string {
    return value
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private tokenize(value: string): string[] {
    return this.normalize(value)
      .split(' ')
      .filter((token) => token.length > 1);
  }
}
