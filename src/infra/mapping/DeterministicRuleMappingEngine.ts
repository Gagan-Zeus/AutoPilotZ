import type { DomFieldSignal, FieldMapping, MappingRequest } from '../../core/entities/Mapping';
import type { MappingModel } from '../../core/ports/MappingModel';

interface RuleMatch {
  profileKey: string;
  confidence: number;
  reason: string;
}

const aliasRules: Record<string, string[]> = {
  email: [
    'email',
    'e mail',
    'email address',
    'mail',
    'correo',
    'correo electronico',
    'courriel',
    'adresse e mail',
    'adresse courriel',
    'e poste',
    'メール',
    '邮箱',
    '電子郵件',
  ],
  firstName: [
    'first name',
    'firstname',
    'given name',
    'forename',
    'fname',
    'nombre',
    'prenom',
    'prénom',
    'vorname',
    '名',
    '名前',
    '名字',
  ],
  middleName: [
    'middle name',
    'middle initial',
    'mname',
    'segundo nombre',
    'deuxieme prenom',
    'deuxième prénom',
    'zweiter vorname',
  ],
  lastName: [
    'last name',
    'lastname',
    'surname',
    'family name',
    'lname',
    'apellido',
    'apellidos',
    'nom de famille',
    'nom',
    'nachname',
    '姓',
    '苗字',
    '姓氏',
  ],
  preferredName: [
    'preferred name',
    'chosen name',
    'nickname',
    'display name',
    'nombre preferido',
    'nom prefere',
    'nom préféré',
  ],
  phone: [
    'phone',
    'phone number',
    'mobile',
    'mobile number',
    'cell',
    'cellphone',
    'telephone',
    'tel',
    'telefono',
    'teléfono',
    'movil',
    'móvil',
    'portable',
    'telephone portable',
    'telefon',
    'handy',
    '電話',
    '手机',
  ],
  alternatePhone: [
    'alternate phone',
    'alternative phone',
    'secondary phone',
    'other phone',
    'backup phone',
    'telefono alternativo',
    'telephone secondaire',
  ],
  dateOfBirth: [
    'date of birth',
    'birth date',
    'dob',
    'birthday',
    'fecha de nacimiento',
    'date de naissance',
    'geburtsdatum',
    '生年月日',
  ],
  gender: ['gender', 'sex', 'genero', 'género', 'genre', 'geschlecht', '性別'],
  nationality: [
    'nationality',
    'citizenship',
    'nacionalidad',
    'nationalite',
    'nationalité',
    'staatsangehorigkeit',
  ],
  address: ['address', 'street address', 'direccion', 'dirección', 'adresse', 'anschrift', '住所'],
  addressLine1: ['address line 1', 'street address 1', 'address 1', 'direccion 1', 'adresse 1'],
  addressLine2: [
    'address line 2',
    'street address 2',
    'address 2',
    'apt suite',
    'direccion 2',
    'adresse 2',
  ],
  city: ['city', 'town', 'locality', 'ciudad', 'ville', 'stadt', '市区町村', '城市'],
  state: ['state', 'province', 'region', 'estado', 'provincia', 'bundesland', '都道府県'],
  postalCode: [
    'postal code',
    'postcode',
    'zip',
    'zip code',
    'codigo postal',
    'código postal',
    'code postal',
    'postleitzahl',
    '郵便番号',
  ],
  country: ['country', 'nation', 'pais', 'país', 'pays', 'land', '国', '国家'],
  linkedIn: ['linkedin', 'linked in', 'linkedin url', 'linkedin profile', 'perfil linkedin'],
  github: ['github', 'git hub', 'github url', 'github profile', 'perfil github'],
  portfolio: ['portfolio', 'website', 'personal website', 'portfolio url', 'site web', 'sitio web'],
};

const autocompleteRules: Record<string, string> = {
  email: 'email',
  'given name': 'firstName',
  'additional name': 'middleName',
  'family name': 'lastName',
  nickname: 'preferredName',
  tel: 'phone',
  'tel national': 'phone',
  bday: 'dateOfBirth',
  sex: 'gender',
  country: 'country',
  'country name': 'country',
  'address line1': 'addressLine1',
  'address line2': 'addressLine2',
  locality: 'city',
  'address level2': 'city',
  'address level1': 'state',
  'postal code': 'postalCode',
  url: 'portfolio',
};

export class DeterministicRuleMappingEngine implements MappingModel {
  mapFields(request: MappingRequest): Promise<FieldMapping[]> {
    const profileKeys = new Set(Object.keys(request.profileAttributes));
    const mappings = request.fields
      .map((field) => this.bestMappingForField(field, profileKeys))
      .filter((mapping): mapping is FieldMapping => mapping !== null)
      .filter((mapping) => mapping.confidence >= request.minConfidence);

    return Promise.resolve(this.dedupeBySelector(mappings));
  }

  private bestMappingForField(
    field: DomFieldSignal,
    profileKeys: Set<string>,
  ): FieldMapping | null {
    const candidates = [
      this.matchByAutocomplete(field, profileKeys),
      this.matchByNativeType(field, profileKeys),
      this.matchByAlias(field, profileKeys),
      this.matchByFuzzyAlias(field, profileKeys),
    ].filter((match): match is RuleMatch => match !== null);

    if (candidates.length === 0) {
      return null;
    }

    const best = candidates.sort((left, right) => right.confidence - left.confidence)[0];
    return {
      selector: field.selector,
      profileKey: best.profileKey,
      confidence: best.confidence,
      reason: best.reason,
    };
  }

  private matchByAutocomplete(field: DomFieldSignal, profileKeys: Set<string>): RuleMatch | null {
    const autocomplete = this.normalize(field.autocomplete ?? '');
    const profileKey = autocompleteRules[autocomplete];
    if (!profileKey || !profileKeys.has(profileKey)) {
      return null;
    }

    return {
      profileKey,
      confidence: 0.99,
      reason: `Deterministic autocomplete rule matched ${field.autocomplete}.`,
    };
  }

  private matchByNativeType(field: DomFieldSignal, profileKeys: Set<string>): RuleMatch | null {
    if (field.type === 'email' && profileKeys.has('email')) {
      return {
        profileKey: 'email',
        confidence: 0.98,
        reason: 'Deterministic native email input rule.',
      };
    }

    if (field.type === 'tel' && profileKeys.has('phone')) {
      return {
        profileKey: 'phone',
        confidence: 0.96,
        reason: 'Deterministic native telephone input rule.',
      };
    }

    if (field.type === 'url' && profileKeys.has('portfolio')) {
      return {
        profileKey: 'portfolio',
        confidence: 0.92,
        reason: 'Deterministic native URL input rule.',
      };
    }

    return null;
  }

  private matchByAlias(field: DomFieldSignal, profileKeys: Set<string>): RuleMatch | null {
    const signals = this.fieldSignals(field);
    let best: RuleMatch | null = null;

    for (const profileKey of profileKeys) {
      const aliases = aliasRules[profileKey] ?? [];
      for (const alias of aliases) {
        const normalizedAlias = this.normalize(alias);
        const exactSignal = signals.strong.find((signal) => signal === normalizedAlias);
        if (exactSignal) {
          const match = {
            profileKey,
            confidence: 0.97,
            reason: `Deterministic exact alias rule matched "${alias}".`,
          };
          best = this.best(best, match);
          continue;
        }

        const containedSignal = signals.all.find((signal) =>
          this.containsPhrase(signal, normalizedAlias),
        );
        if (containedSignal) {
          const match = {
            profileKey,
            confidence: this.isStrongSignal(containedSignal, signals.strong) ? 0.94 : 0.91,
            reason: `Deterministic alias phrase rule matched "${alias}".`,
          };
          best = this.best(best, match);
        }
      }
    }

    return best;
  }

  private matchByFuzzyAlias(field: DomFieldSignal, profileKeys: Set<string>): RuleMatch | null {
    const signals = this.fieldSignals(field);
    let best: RuleMatch | null = null;

    for (const profileKey of profileKeys) {
      const aliases = aliasRules[profileKey] ?? [];
      for (const alias of aliases) {
        const normalizedAlias = this.normalize(alias);
        for (const signal of signals.all) {
          const ratio = this.similarity(signal, normalizedAlias);
          if (ratio >= 0.78) {
            const match = {
              profileKey,
              confidence: Math.min(0.89, Number((0.72 + ratio * 0.18).toFixed(2))),
              reason: `Deterministic fuzzy alias rule matched "${alias}".`,
            };
            best = this.best(best, match);
          }
        }
      }
    }

    return best;
  }

  private fieldSignals(field: DomFieldSignal): { strong: string[]; all: string[] } {
    const strong = [
      field.autocomplete,
      field.name,
      field.id,
      field.label,
      field.ariaLabel,
      field.placeholder,
      field.context.labelText,
    ]
      .map((value) => this.normalize(value ?? ''))
      .filter(Boolean);

    const all = [
      ...strong,
      field.context.surroundingText,
      field.context.previousSiblingText,
      field.context.nextSiblingText,
      field.context.formTitle,
      field.context.sectionTitle,
      field.context.urlPath,
    ]
      .map((value) => this.normalize(value ?? ''))
      .filter(Boolean);

    return { strong: [...new Set(strong)], all: [...new Set(all)] };
  }

  private containsPhrase(signal: string, alias: string): boolean {
    if (signal === alias) {
      return true;
    }
    return ` ${signal} `.includes(` ${alias} `);
  }

  private isStrongSignal(signal: string, strongSignals: string[]): boolean {
    return strongSignals.includes(signal);
  }

  private best(current: RuleMatch | null, candidate: RuleMatch): RuleMatch {
    return !current || candidate.confidence > current.confidence ? candidate : current;
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
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, ' ')
      .trim();
  }

  private similarity(left: string, right: string): number {
    if (!left || !right) {
      return 0;
    }
    if (left === right) {
      return 1;
    }

    const leftTokens = left.split(' ');
    const rightTokens = right.split(' ');
    const tokenScores = leftTokens.flatMap((leftToken) =>
      rightTokens.map((rightToken) => this.levenshteinSimilarity(leftToken, rightToken)),
    );
    const bestTokenScore = Math.max(...tokenScores, 0);
    const phraseScore = this.levenshteinSimilarity(left, right);
    return Math.max(bestTokenScore, phraseScore);
  }

  private levenshteinSimilarity(left: string, right: string): number {
    const distance = this.levenshteinDistance(left, right);
    return 1 - distance / Math.max(left.length, right.length, 1);
  }

  private levenshteinDistance(left: string, right: string): number {
    const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    const current = Array.from({ length: right.length + 1 }, () => 0);

    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
      current[0] = leftIndex;
      for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
        const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
        current[rightIndex] = Math.min(
          current[rightIndex - 1] + 1,
          previous[rightIndex] + 1,
          previous[rightIndex - 1] + substitutionCost,
        );
      }
      previous.splice(0, previous.length, ...current);
    }

    return previous[right.length] ?? 0;
  }
}
