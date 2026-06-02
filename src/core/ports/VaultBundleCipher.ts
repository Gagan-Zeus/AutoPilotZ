import type { ExportedVaultBundle, ExportedVaultPayload } from '../entities/Profile';

export interface VaultBundleCipher {
  encrypt(payload: ExportedVaultPayload, passphrase: string): Promise<ExportedVaultBundle>;
  decrypt(bundle: ExportedVaultBundle, passphrase: string): Promise<ExportedVaultPayload>;
}
