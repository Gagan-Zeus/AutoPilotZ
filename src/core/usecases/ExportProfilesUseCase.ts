import type { ExportedVaultBundle } from '../entities/Profile';
import type { ProfileVaultRepository } from '../ports/ProfileVaultRepository';
import type { VaultBundleCipher } from '../ports/VaultBundleCipher';

export interface ExportProfilesCommand {
  passphrase: string;
  profileIds?: string[];
}

export class ExportProfilesUseCase {
  constructor(
    private readonly repository: ProfileVaultRepository,
    private readonly vaultBundleCipher: VaultBundleCipher,
  ) {}

  async execute(command: ExportProfilesCommand): Promise<ExportedVaultBundle> {
    if (command.passphrase.length < 8) {
      throw new Error('Passphrase must be at least 8 characters.');
    }

    const profileIdSet = command.profileIds ? new Set(command.profileIds) : undefined;
    const profiles = (await this.repository.list(command.passphrase)).filter(
      (profile) => !profileIdSet || profileIdSet.has(profile.id),
    );
    return this.vaultBundleCipher.encrypt({ profiles }, command.passphrase);
  }
}
