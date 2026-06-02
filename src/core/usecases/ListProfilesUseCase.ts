import type { VaultProfile } from '../entities/Profile';
import type { ProfileVaultRepository } from '../ports/ProfileVaultRepository';

export class ListProfilesUseCase {
  constructor(private readonly repository: ProfileVaultRepository) {}

  execute(passphrase: string): Promise<VaultProfile[]> {
    return this.repository.list(passphrase);
  }
}
