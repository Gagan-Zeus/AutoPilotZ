import type { ExportedVaultBundle, ExportedVaultPayload } from '../../core/entities/Profile';
import type { VaultBundleCipher } from '../../core/ports/VaultBundleCipher';
import { ProfileCrypto } from './ProfileCrypto';

export class EncryptedVaultBundleCipher implements VaultBundleCipher {
  constructor(private readonly profileCrypto = new ProfileCrypto()) {}

  async encrypt(payload: ExportedVaultPayload, passphrase: string): Promise<ExportedVaultBundle> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const encrypted = await this.profileCrypto.encryptJson(payload, passphrase, salt);

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      salt: this.profileCrypto.toBase64(salt),
      iv: encrypted.iv,
      encryptedPayload: encrypted.encryptedPayload,
    };
  }

  async decrypt(bundle: ExportedVaultBundle, passphrase: string): Promise<ExportedVaultPayload> {
    if (bundle.version !== 1) {
      throw new Error('Unsupported vault export version.');
    }

    return this.profileCrypto.decryptJson<ExportedVaultPayload>(
      {
        encryptedPayload: bundle.encryptedPayload,
        iv: bundle.iv,
      },
      passphrase,
      this.profileCrypto.fromBase64(bundle.salt),
    );
  }
}
