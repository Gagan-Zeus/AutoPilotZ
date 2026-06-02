import type { VaultProfile } from '../entities/Profile';
import { createProfile } from '../entities/Profile';
import type { ProfileVaultRepository } from '../ports/ProfileVaultRepository';

export interface SaveProfileCommand {
  id?: string;
  label: string;
  attributes: VaultProfile['attributes'];
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

    const profile = createProfile({
      id: command.id,
      label: command.label,
      attributes: command.attributes,
    });

    return this.repository.save(profile, command.passphrase);
  }
}
