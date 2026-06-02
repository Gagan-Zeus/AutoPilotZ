import type { VaultProfile } from '../entities/Profile';
import type { ProfileVaultRepository } from '../ports/ProfileVaultRepository';

export interface SwitchProfileCommand {
  passphrase: string;
  profileId: string;
}

export class SwitchProfileUseCase {
  constructor(private readonly repository: ProfileVaultRepository) {}

  async execute(command: SwitchProfileCommand): Promise<VaultProfile> {
    const profiles = await this.repository.list(command.passphrase);
    const profile = profiles.find((candidate) => candidate.id === command.profileId);
    if (!profile) {
      throw new Error('Profile not found.');
    }

    return profile;
  }
}
