import { describe, expect, it } from 'vitest';
import {
  createReviewItems,
  previewAttributeValue,
  reviewItemToFeedbackInputs,
  reviewItemToMapping,
} from '../src/popup/review';
import { field } from './field-test-utils';

describe('popup review helpers', () => {
  it('creates editable review items from fields, mappings, and profile attributes', () => {
    const items = createReviewItems(
      [
        field({
          fieldId: 'email-field',
          selector: '#email',
          label: 'Email address',
          type: 'email',
          context: {
            pageTitle: 'Signup',
            urlPath: '/join',
            sectionTitle: 'Contact',
          },
        }),
      ],
      [
        {
          fieldId: 'email-field',
          selector: '#email',
          profileKey: 'email',
          confidence: 0.98,
          reason: 'Native email rule.',
        },
      ],
      { email: 'ada@example.com' },
    );

    expect(items).toEqual([
      expect.objectContaining({
        id: 'email-field',
        fieldId: 'email-field',
        selector: '#email',
        fieldLabel: 'Email address',
        detectedProfileKey: 'email',
        editedProfileKey: 'email',
        confidence: 0.98,
        valuePreview: 'ada@example.com',
        status: 'pending',
      }),
    ]);
    expect(items[0]?.fieldContext).toContain('Contact');
  });

  it('masks sensitive value previews', () => {
    expect(previewAttributeValue('ssn', '123456789')).toBe('•••••••89');
    expect(previewAttributeValue('email', 'ada@example.com')).toBe('ada@example.com');
    expect(previewAttributeValue('middleName', '')).toBe('No value');
  });

  it('converts edited review items back to fill mappings', () => {
    const mapping = reviewItemToMapping({
      id: 'name-field',
      fieldId: 'name-field',
      selector: '#name',
      fieldLabel: 'Name',
      fieldContext: 'text',
      detectedProfileKey: 'preferredName',
      editedProfileKey: 'firstName',
      confidence: 0.7,
      reason: 'Original.',
      valuePreview: 'Ada',
      status: 'accepted',
    });

    expect(mapping).toEqual({
      fieldId: 'name-field',
      selector: '#name',
      profileKey: 'firstName',
      confidence: 0.7,
      reason: 'User edited mapping from preferredName to firstName.',
    });
  });

  it('converts review decisions into local feedback records', () => {
    const item = createReviewItems(
      [field({ fieldId: 'name-field', selector: '#name', label: 'Name' })],
      [
        {
          fieldId: 'name-field',
          selector: '#name',
          profileKey: 'preferredName',
          confidence: 0.72,
          reason: 'Ambiguous name.',
        },
      ],
      { firstName: 'Ada', preferredName: 'Ada' },
    )[0];

    if (!item) {
      throw new Error('Expected review item');
    }

    expect(
      reviewItemToFeedbackInputs({ ...item, editedProfileKey: 'firstName' }, 'accepted').map(
        (feedback) => feedback.kind,
      ),
    ).toEqual(['accepted', 'override']);
    expect(reviewItemToFeedbackInputs(item, 'rejected')).toEqual([
      expect.objectContaining({
        kind: 'rejected',
        selector: '#name',
        profileKey: 'preferredName',
      }),
    ]);
  });
});
