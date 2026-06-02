import { describe, expect, it } from 'vitest';
import type { VaultProfile } from '../src/core/entities/Profile';
import type { ProfileVaultRepository } from '../src/core/ports/ProfileVaultRepository';
import { SaveProfileUseCase } from '../src/core/usecases/SaveProfileUseCase';

class InMemoryVaultRepository implements ProfileVaultRepository {
  profiles: VaultProfile[] = [];

  list(): Promise<VaultProfile[]> {
    return Promise.resolve(this.profiles);
  }

  save(profile: VaultProfile): Promise<VaultProfile> {
    this.profiles.push(profile);
    return Promise.resolve(profile);
  }

  remove(id: string): Promise<void> {
    this.profiles = this.profiles.filter((profile) => profile.id !== id);
    return Promise.resolve();
  }
}

describe('SaveProfileUseCase', () => {
  it('validates passphrase length before saving', async () => {
    const useCase = new SaveProfileUseCase(new InMemoryVaultRepository());

    await expect(
      useCase.execute({
        label: 'Default',
        attributes: { email: 'ada@example.com' },
        passphrase: 'short',
      }),
    ).rejects.toThrow('Passphrase');
  });

  it('creates a profile through the repository', async () => {
    const repository = new InMemoryVaultRepository();
    const useCase = new SaveProfileUseCase(repository);

    const profile = await useCase.execute({
      label: 'Default',
      attributes: { email: 'ada@example.com' },
      passphrase: 'long-enough-passphrase',
    });

    expect(profile.id).toEqual(expect.any(String));
    expect(repository.profiles).toHaveLength(1);
  });
});
