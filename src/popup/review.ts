import type { MappingFeedbackInput } from '../core/entities/FeedbackLearning';
import type { DomFieldSignal, FieldMapping } from '../core/entities/Mapping';
import type { ProfileAttributeValue } from '../core/entities/Profile';

export type ReviewItemStatus = 'pending' | 'accepted' | 'rejected';

export interface MappingReviewItem {
  id: string;
  fieldId?: string;
  selector: string;
  fieldLabel: string;
  fieldContext: string;
  detectedProfileKey: string;
  editedProfileKey: string;
  confidence: number;
  reason: string;
  valuePreview: string;
  status: ReviewItemStatus;
  field?: DomFieldSignal;
}

export type ProfileAttributes = Record<string, ProfileAttributeValue>;

export const createReviewItems = (
  fields: DomFieldSignal[],
  mappings: FieldMapping[],
  attributes: ProfileAttributes,
): MappingReviewItem[] => {
  const fieldsBySelector = new Map(fields.map((field) => [field.selector, field]));

  return mappings.map((mapping) => {
    const field = fieldsBySelector.get(mapping.selector);
    const profileKey = mapping.profileKey;

    return {
      id: mapping.fieldId ?? field?.fieldId ?? mapping.selector,
      fieldId: mapping.fieldId ?? field?.fieldId,
      selector: mapping.selector,
      fieldLabel: fieldDisplayName(field, mapping),
      fieldContext: fieldContextSummary(field),
      detectedProfileKey: profileKey,
      editedProfileKey: profileKey,
      confidence: mapping.confidence,
      reason: mapping.reason,
      valuePreview: previewAttributeValue(profileKey, attributes[profileKey]),
      status: 'pending',
      field,
    };
  });
};

export const reviewItemToMapping = (item: MappingReviewItem): FieldMapping => ({
  fieldId: item.fieldId,
  selector: item.selector,
  profileKey: item.editedProfileKey,
  confidence: item.confidence,
  reason:
    item.editedProfileKey === item.detectedProfileKey
      ? item.reason
      : `User edited mapping from ${item.detectedProfileKey} to ${item.editedProfileKey}.`,
});

export const reviewItemToFeedbackInputs = (
  item: MappingReviewItem,
  status: ReviewItemStatus,
): MappingFeedbackInput[] => {
  if (!item.field) {
    return [];
  }

  if (status === 'rejected') {
    return [
      {
        kind: 'rejected',
        field: item.field,
        selector: item.selector,
        fieldId: item.fieldId,
        profileKey: item.editedProfileKey,
        originalProfileKey: item.detectedProfileKey,
        confidence: item.confidence,
        reason: item.reason,
      },
    ];
  }

  if (status !== 'accepted') {
    return [];
  }

  const accepted: MappingFeedbackInput = {
    kind: 'accepted',
    field: item.field,
    selector: item.selector,
    fieldId: item.fieldId,
    profileKey: item.editedProfileKey,
    confidence: item.confidence,
    reason: item.reason,
  };

  if (item.editedProfileKey === item.detectedProfileKey) {
    return [accepted];
  }

  return [
    accepted,
    {
      kind: 'override',
      field: item.field,
      selector: item.selector,
      fieldId: item.fieldId,
      profileKey: item.editedProfileKey,
      originalProfileKey: item.detectedProfileKey,
      confidence: item.confidence,
      reason: `User override from ${item.detectedProfileKey} to ${item.editedProfileKey}.`,
    },
  ];
};

export const previewAttributeValue = (
  profileKey: string,
  value: ProfileAttributeValue | undefined,
): string => {
  if (value === undefined || value === '') {
    return 'No value';
  }

  const stringValue = String(value);
  if (isSensitiveProfileKey(profileKey)) {
    return maskValue(stringValue);
  }

  return stringValue.length > 42 ? `${stringValue.slice(0, 39)}...` : stringValue;
};

const fieldDisplayName = (field: DomFieldSignal | undefined, mapping: FieldMapping): string =>
  field?.label ??
  field?.context.labelText ??
  field?.placeholder ??
  field?.ariaLabel ??
  field?.name ??
  field?.id ??
  mapping.selector;

const fieldContextSummary = (field: DomFieldSignal | undefined): string => {
  if (!field) {
    return 'Field details unavailable';
  }

  return [
    field.type ?? field.kind,
    field.context.sectionTitle,
    field.context.formTitle,
    field.context.urlPath,
  ]
    .filter(Boolean)
    .join(' · ');
};

const isSensitiveProfileKey = (profileKey: string): boolean =>
  /password|cvv|cvc|otp|mfa|2fa|ssn|aadhaar|aadhar|pin|recovery|backup/i.test(profileKey);

const maskValue = (value: string): string => {
  if (value.length <= 4) {
    return '••••';
  }

  return `${'•'.repeat(Math.min(value.length - 2, 8))}${value.slice(-2)}`;
};
