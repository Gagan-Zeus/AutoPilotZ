import type { ExportedVaultBundle, ExportedVaultPayload, VaultProfile } from '../entities/Profile';
import { createProfile, validateProfileData } from '../entities/Profile';
import type { ProfileVaultRepository } from '../ports/ProfileVaultRepository';
import type { VaultBundleCipher } from '../ports/VaultBundleCipher';

export interface ImportProfilesCommand {
  passphrase: string;
  bundle: ExportedVaultBundle;
  mode?: 'merge' | 'replace';
}

export interface ImportProfilesResult {
  imported: number;
  profiles: VaultProfile[];
}

export class ImportProfilesUseCase {
  constructor(
    private readonly repository: ProfileVaultRepository,
    private readonly vaultBundleCipher: VaultBundleCipher,
  ) {}

  async execute(command: ImportProfilesCommand): Promise<ImportProfilesResult> {
    if (command.passphrase.length < 8) {
      throw new Error('Passphrase must be at least 8 characters.');
    }

    const payload: ExportedVaultPayload = await this.vaultBundleCipher.decrypt(
      command.bundle,
      command.passphrase,
    );

    const currentProfiles = await this.repository.list(command.passphrase);
    if (command.mode === 'replace') {
      await Promise.all(currentProfiles.map((profile) => this.repository.remove(profile.id)));
    }

    const importedProfiles = await Promise.all(
      payload.profiles.map((profile) => this.importProfile(profile, command.passphrase)),
    );

    return {
      imported: importedProfiles.length,
      profiles: importedProfiles,
    };
  }

  private async importProfile(profile: VaultProfile, passphrase: string): Promise<VaultProfile> {
    const validation = validateProfileData(profile.data);
    if (!validation.valid) {
      throw new Error(
        `Profile "${profile.label}" is invalid: ${validation.issues
          .map((issue) => issue.message)
          .join(' ')}`,
      );
    }

    const imported = createProfile({
      id: profile.id || crypto.randomUUID(),
      label: profile.label,
      data: profile.data,
      createdAt: profile.createdAt,
    });
    return this.repository.save(imported, passphrase);
  }
}
