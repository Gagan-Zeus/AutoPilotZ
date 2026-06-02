import { describe, expect, it } from 'vitest';
import { createProfile } from '../src/core/entities/Profile';
import { EncryptedVaultBundleCipher } from '../src/infra/security/EncryptedVaultBundleCipher';
import { ProfileCrypto } from '../src/infra/security/ProfileCrypto';
import { makeProfileData } from './profile-fixtures';

describe('ProfileCrypto', () => {
  it('round trips encrypted JSON with a passphrase', async () => {
    const profileCrypto = new ProfileCrypto();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const input = { email: 'ada@example.com', firstName: 'Ada' };

    const encrypted = await profileCrypto.encryptJson(input, 'correct horse battery staple', salt);
    const decrypted = await profileCrypto.decryptJson<typeof input>(
      encrypted,
      'correct horse battery staple',
      salt,
    );

    expect(encrypted.encryptedPayload).not.toContain(input.email);
    expect(decrypted).toEqual(input);
  });

  it('rejects decryption with the wrong passphrase', async () => {
    const profileCrypto = new ProfileCrypto();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const encrypted = await profileCrypto.encryptJson(
      { email: 'ada@example.com' },
      'right-passphrase',
      salt,
    );

    await expect(profileCrypto.decryptJson(encrypted, 'wrong-passphrase', salt)).rejects.toThrow();
  });

  it('exports profiles as encrypted AES-GCM bundles', async () => {
    const cipher = new EncryptedVaultBundleCipher();
    const profile = createProfile({
      label: 'Default',
      data: makeProfileData({ email: 'private@example.com' }),
    });

    const bundle = await cipher.encrypt({ profiles: [profile] }, 'correct horse battery staple');
    const decrypted = await cipher.decrypt(bundle, 'correct horse battery staple');

    expect(bundle.encryptedPayload).not.toContain('private@example.com');
    expect(bundle.salt).toEqual(expect.any(String));
    expect(bundle.iv).toEqual(expect.any(String));
    expect(decrypted.profiles[0]?.data.email).toBe('private@example.com');
  });
});
