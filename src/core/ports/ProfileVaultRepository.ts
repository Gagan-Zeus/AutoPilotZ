import type { VaultProfile } from '../entities/Profile';

export interface ProfileVaultRepository {
  list(passphrase: string): Promise<VaultProfile[]>;
  save(profile: VaultProfile, passphrase: string): Promise<VaultProfile>;
  remove(id: string): Promise<void>;
}
