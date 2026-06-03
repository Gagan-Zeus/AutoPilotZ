export interface SanitizeUntrustedTextOptions {
  maxLength?: number;
  neutralizeInstructions?: boolean;
}

const defaultMaxLength = 160;
const bidiControls = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
const suspiciousInstructionPatterns: RegExp[] = [
  /\bignore\s+(all\s+)?(previous|above|prior|system|developer)\s+instructions?\b/gi,
  /\b(disregard|override)\s+(all\s+)?(previous|above|prior|system|developer)\s+instructions?\b/gi,
  /\b(system|developer)\s+(prompt|message|instruction)s?\b/gi,
  /\byou\s+are\s+(now|no\s+longer)\b/gi,
  /\b(reveal|leak|exfiltrate|print)\s+(secrets?|passwords?|tokens?|keys?|profile\s+data)\b/gi,
  /\breturn\s+json\s+only\b/gi,
  /\bexecute\s+(javascript|script|code)\b/gi,
];

export const sanitizeUntrustedText = (
  value: string | null | undefined,
  options: SanitizeUntrustedTextOptions = {},
): string | undefined => {
  const maxLength = options.maxLength ?? defaultMaxLength;
  let cleaned = value
    ?.split('')
    .map((character) => (isControlCharacter(character) ? ' ' : character))
    .join('')
    .replace(bidiControls, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    return undefined;
  }

  if (options.neutralizeInstructions) {
    for (const pattern of suspiciousInstructionPatterns) {
      cleaned = cleaned.replace(pattern, '[untrusted instruction removed]');
    }
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
  }

  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1)}...` : cleaned;
};

export const sanitizeUntrustedJsonValue = <T>(value: T, maxTextLength = 240): T => {
  return sanitizeUnknownJsonValue(value, maxTextLength) as T;
};

const sanitizeUnknownJsonValue = (value: unknown, maxTextLength: number): unknown => {
  if (typeof value === 'string') {
    return sanitizeUntrustedText(value, {
      maxLength: maxTextLength,
      neutralizeInstructions: true,
    });
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeUnknownJsonValue(entry, maxTextLength));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        sanitizeUnknownJsonValue(child, maxTextLength),
      ]),
    );
  }

  return value;
};

const isControlCharacter = (character: string): boolean => {
  const codePoint = character.charCodeAt(0);
  return (
    (codePoint >= 0 && codePoint <= 8) ||
    codePoint === 11 ||
    codePoint === 12 ||
    (codePoint >= 14 && codePoint <= 31) ||
    (codePoint >= 127 && codePoint <= 159)
  );
};
