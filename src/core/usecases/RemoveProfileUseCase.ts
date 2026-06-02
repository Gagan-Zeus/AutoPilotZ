import type { ProfileVaultRepository } from '../ports/ProfileVaultRepository';

export class RemoveProfileUseCase {
  constructor(private readonly repository: ProfileVaultRepository) {}

  execute(id: string): Promise<void> {
    if (!id.trim()) {
      throw new Error('Profile id is required.');
    }

    return this.repository.remove(id);
  }
}
