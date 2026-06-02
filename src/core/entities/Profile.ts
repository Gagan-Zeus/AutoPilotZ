export type ProfileAttributeValue = string | number | boolean;

export interface VaultProfile {
  id: string;
  label: string;
  attributes: Record<string, ProfileAttributeValue>;
  createdAt: string;
  updatedAt: string;
}

export interface EncryptedProfileRecord {
  id: string;
  encryptedPayload: string;
  iv: string;
  updatedAt: string;
}

export const createProfile = (
  input: Pick<VaultProfile, 'label' | 'attributes'> & { id?: string },
  now = new Date(),
): VaultProfile => {
  const timestamp = now.toISOString();

  return {
    id: input.id ?? crypto.randomUUID(),
    label: input.label.trim(),
    attributes: input.attributes,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};
