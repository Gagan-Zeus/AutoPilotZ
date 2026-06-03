import type { DomFieldSignal, FieldMapping } from './Mapping';
import type { ProfileAttributeValue } from './Profile';
import { sanitizeUntrustedText } from '../security/UntrustedText';

export type MappingFeedbackKind = 'accepted' | 'rejected' | 'override';

export interface MappingFeedbackInput {
  kind: MappingFeedbackKind;
  field: DomFieldSignal;
  selector: string;
  fieldId?: string;
  profileKey: string;
  originalProfileKey?: string;
  confidence: number;
  reason?: string;
}

export interface LearnedMappingFeedback {
  id: string;
  kind: MappingFeedbackKind;
  fingerprint: string;
  selector: string;
  fieldId?: string;
  profileKey: string;
  originalProfileKey?: string;
  confidence: number;
  reason?: string;
  fieldSignals: LearningFieldSignals;
  count: number;
  createdAt: string;
  updatedAt: string;
}

export interface LearningFieldSignals {
  kind: DomFieldSignal['kind'];
  type?: string;
  id?: string;
  name?: string;
  placeholder?: string;
  label?: string;
  ariaLabel?: string;
  autocomplete?: string;
  sectionHeading?: string;
  urlPath?: string;
}

export interface ApplyMappingFeedbackRequest {
  fields: DomFieldSignal[];
  mappings: FieldMapping[];
  feedback: LearnedMappingFeedback[];
  profileAttributes: Record<string, ProfileAttributeValue>;
  minConfidence: number;
}

export const createLearnedMappingFeedback = (
  input: MappingFeedbackInput,
  now = new Date(),
): LearnedMappingFeedback => {
  const timestamp = now.toISOString();
  const fingerprint = fieldLearningFingerprint(input.field);
  const profileKey = normalizeProfileKey(input.profileKey);
  const originalProfileKey = input.originalProfileKey
    ? normalizeProfileKey(input.originalProfileKey)
    : undefined;

  return {
    id: feedbackRecordId(input.kind, fingerprint, profileKey, originalProfileKey),
    kind: input.kind,
    fingerprint,
    selector: input.selector,
    fieldId: input.fieldId,
    profileKey,
    originalProfileKey,
    confidence: input.confidence,
    reason: input.reason,
    fieldSignals: fieldLearningSignals(input.field),
    count: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

export const fieldLearningFingerprint = (field: DomFieldSignal): string => {
  const signals = fieldLearningSignals(field);
  const source = [
    signals.kind,
    signals.type,
    signals.id,
    signals.name,
    signals.placeholder,
    signals.label,
    signals.ariaLabel,
    signals.autocomplete,
    signals.sectionHeading,
    signals.urlPath,
  ]
    .map((value) => normalizeSignal(value ?? ''))
    .filter(Boolean)
    .join('|');

  return `field:${hashString(source || normalizeSignal(field.selector))}`;
};

export const fieldLearningSignals = (field: DomFieldSignal): LearningFieldSignals => ({
  kind: field.kind,
  type: sanitizeUntrustedText(field.type, { neutralizeInstructions: true }),
  id: sanitizeUntrustedText(field.id, { neutralizeInstructions: true }),
  name: sanitizeUntrustedText(field.name, { neutralizeInstructions: true }),
  placeholder: sanitizeUntrustedText(field.placeholder, { neutralizeInstructions: true }),
  label: sanitizeUntrustedText(field.label ?? field.context.labelText, {
    neutralizeInstructions: true,
  }),
  ariaLabel: sanitizeUntrustedText(field.ariaLabel, { neutralizeInstructions: true }),
  autocomplete: sanitizeUntrustedText(field.autocomplete, { neutralizeInstructions: true }),
  sectionHeading: sanitizeUntrustedText(field.sectionHeading ?? field.context.sectionTitle, {
    neutralizeInstructions: true,
  }),
  urlPath: sanitizeUntrustedText(field.context.urlPath, {
    neutralizeInstructions: true,
    maxLength: 120,
  }),
});

export const applyMappingFeedback = ({
  fields,
  mappings,
  feedback,
  profileAttributes,
  minConfidence,
}: ApplyMappingFeedbackRequest): FieldMapping[] => {
  const selected = new Map(mappings.map((mapping) => [mapping.selector, mapping]));
  const feedbackByFingerprint = groupFeedbackByFingerprint(feedback);

  for (const field of fields) {
    const fieldFeedback = feedbackByFingerprint.get(fieldLearningFingerprint(field)) ?? [];
    if (fieldFeedback.length === 0) {
      continue;
    }

    const current = selected.get(field.selector);
    if (current && isRejected(current.profileKey, fieldFeedback)) {
      selected.delete(field.selector);
    }

    const override = newestUsableFeedback('override', fieldFeedback, profileAttributes);
    if (override && !isRejected(override.profileKey, fieldFeedback, override.updatedAt)) {
      selected.set(field.selector, feedbackToMapping(field, override, 'Local feedback override.'));
      continue;
    }

    const accepted = newestUsableFeedback('accepted', fieldFeedback, profileAttributes);
    if (accepted && !isRejected(accepted.profileKey, fieldFeedback, accepted.updatedAt)) {
      const existing = selected.get(field.selector);
      if (!existing || existing.confidence < 0.9 || existing.profileKey === accepted.profileKey) {
        selected.set(field.selector, feedbackToMapping(field, accepted, 'Local feedback match.'));
      }
    }
  }

  return [...selected.values()].filter((mapping) => mapping.confidence >= minConfidence);
};

export const mergeLearnedFeedback = (
  current: LearnedMappingFeedback[],
  incoming: LearnedMappingFeedback[],
  maxRecords = 500,
): LearnedMappingFeedback[] => {
  const byId = new Map(current.map((record) => [record.id, record]));

  for (const record of incoming) {
    const existing = byId.get(record.id);
    byId.set(
      record.id,
      existing
        ? {
            ...existing,
            selector: record.selector,
            fieldId: record.fieldId,
            confidence: record.confidence,
            reason: record.reason,
            fieldSignals: record.fieldSignals,
            count: existing.count + 1,
            updatedAt: record.updatedAt,
          }
        : record,
    );
  }

  return [...byId.values()]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, maxRecords);
};

const feedbackToMapping = (
  field: DomFieldSignal,
  feedback: LearnedMappingFeedback,
  reason: string,
): FieldMapping => ({
  fieldId: field.fieldId,
  selector: field.selector,
  profileKey: feedback.profileKey,
  confidence: feedback.kind === 'override' ? 0.995 : Math.max(0.97, feedback.confidence),
  reason,
});

const newestUsableFeedback = (
  kind: MappingFeedbackKind,
  records: LearnedMappingFeedback[],
  profileAttributes: Record<string, ProfileAttributeValue>,
): LearnedMappingFeedback | undefined =>
  records
    .filter((record) => record.kind === kind)
    .filter((record) => Object.prototype.hasOwnProperty.call(profileAttributes, record.profileKey))
    .sort(byNewest)[0];

const isRejected = (
  profileKey: string,
  records: LearnedMappingFeedback[],
  acceptedAfter?: string,
): boolean => {
  const rejection = records
    .filter((record) => record.kind === 'rejected' && record.profileKey === profileKey)
    .sort(byNewest)[0];

  if (!rejection) {
    return false;
  }

  return !acceptedAfter || rejection.updatedAt > acceptedAfter;
};

const groupFeedbackByFingerprint = (
  feedback: LearnedMappingFeedback[],
): Map<string, LearnedMappingFeedback[]> => {
  const grouped = new Map<string, LearnedMappingFeedback[]>();
  for (const record of feedback) {
    grouped.set(record.fingerprint, [...(grouped.get(record.fingerprint) ?? []), record]);
  }
  return grouped;
};

const feedbackRecordId = (
  kind: MappingFeedbackKind,
  fingerprint: string,
  profileKey: string,
  originalProfileKey?: string,
): string => [kind, fingerprint, profileKey, originalProfileKey ?? ''].join(':');

const normalizeProfileKey = (value: string): string => value.trim();

const normalizeSignal = (value: string): string =>
  value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const hashString = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
};

const byNewest = (left: LearnedMappingFeedback, right: LearnedMappingFeedback): number =>
  right.updatedAt.localeCompare(left.updatedAt);
