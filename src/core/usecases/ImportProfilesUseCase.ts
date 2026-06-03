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
    if (!Array.isArray(payload.profiles)) {
      throw new Error('Vault import payload is invalid.');
    }

    const importedProfiles = this.prepareProfiles(payload.profiles);

    const currentProfiles = await this.repository.list(command.passphrase);
    if (command.mode === 'replace') {
      for (const profile of currentProfiles) {
        await this.repository.remove(profile.id);
      }
    }

    for (const profile of importedProfiles) {
      await this.repository.save(profile, command.passphrase);
    }

    return {
      imported: importedProfiles.length,
      profiles: importedProfiles,
    };
  }

  private prepareProfiles(profiles: VaultProfile[]): VaultProfile[] {
    const importedProfiles = profiles.map((profile) => this.prepareProfile(profile));
    return [...new Map(importedProfiles.map((profile) => [profile.id, profile])).values()];
  }

  private prepareProfile(profile: VaultProfile): VaultProfile {
    const validation = validateProfileData(profile.data);
    if (!validation.valid) {
      throw new Error(
        `Profile "${profile.label}" is invalid: ${validation.issues
          .map((issue) => issue.message)
          .join(' ')}`,
      );
    }

    return createProfile({
      id: profile.id || crypto.randomUUID(),
      label: profile.label,
      data: profile.data,
      createdAt: profile.createdAt,
    });
  }
}
