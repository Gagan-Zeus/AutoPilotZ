import { describe, expect, it } from 'vitest';
import { ProfileCrypto } from '../src/infra/security/ProfileCrypto';

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
});
