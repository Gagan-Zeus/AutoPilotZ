import type { ProfileData, VaultProfile } from '../entities/Profile';
import { createProfile, validateProfileData } from '../entities/Profile';
import type { ProfileVaultRepository } from '../ports/ProfileVaultRepository';

export interface SaveProfileCommand {
  id?: string;
  label: string;
  data: ProfileData;
  passphrase: string;
}

export class SaveProfileUseCase {
  constructor(private readonly repository: ProfileVaultRepository) {}

  async execute(command: SaveProfileCommand): Promise<VaultProfile> {
    if (command.passphrase.length < 8) {
      throw new Error('Passphrase must be at least 8 characters.');
    }

    if (!command.label.trim()) {
      throw new Error('Profile label is required.');
    }

    const validation = validateProfileData(command.data);
    if (!validation.valid) {
      throw new Error(validation.issues.map((issue) => issue.message).join(' '));
    }

    const profile = createProfile({
      id: command.id,
      label: command.label,
      data: command.data,
    });

    return this.repository.save(profile, command.passphrase);
  }
}
