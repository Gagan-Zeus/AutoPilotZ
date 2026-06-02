import { describe, expect, it } from 'vitest';
import type {
  ExportedVaultBundle,
  ExportedVaultPayload,
  VaultProfile,
} from '../src/core/entities/Profile';
import type { ProfileVaultRepository } from '../src/core/ports/ProfileVaultRepository';
import type { VaultBundleCipher } from '../src/core/ports/VaultBundleCipher';
import { ExportProfilesUseCase } from '../src/core/usecases/ExportProfilesUseCase';
import { ImportProfilesUseCase } from '../src/core/usecases/ImportProfilesUseCase';
import { SaveProfileUseCase } from '../src/core/usecases/SaveProfileUseCase';
import { SearchProfilesUseCase } from '../src/core/usecases/SearchProfilesUseCase';
import { SwitchProfileUseCase } from '../src/core/usecases/SwitchProfileUseCase';
import { ValidateProfileUseCase } from '../src/core/usecases/ValidateProfileUseCase';
import { makeProfileData } from './profile-fixtures';

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

class FakeVaultBundleCipher implements VaultBundleCipher {
  lastPayload?: ExportedVaultPayload;

  encrypt(payload: ExportedVaultPayload): Promise<ExportedVaultBundle> {
    this.lastPayload = payload;
    return Promise.resolve({
      version: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      salt: 'salt',
      iv: 'iv',
      encryptedPayload: JSON.stringify(payload),
    });
  }

  decrypt(bundle: ExportedVaultBundle): Promise<ExportedVaultPayload> {
    return Promise.resolve(JSON.parse(bundle.encryptedPayload) as ExportedVaultPayload);
  }
}

describe('SaveProfileUseCase', () => {
  it('validates passphrase length before saving', async () => {
    const useCase = new SaveProfileUseCase(new InMemoryVaultRepository());

    await expect(
      useCase.execute({
        label: 'Default',
        data: makeProfileData(),
        passphrase: 'short',
      }),
    ).rejects.toThrow('Passphrase');
  });

  it('creates a profile through the repository', async () => {
    const repository = new InMemoryVaultRepository();
    const useCase = new SaveProfileUseCase(repository);

    const profile = await useCase.execute({
      label: 'Default',
      data: makeProfileData(),
      passphrase: 'long-enough-passphrase',
    });

    expect(profile.id).toEqual(expect.any(String));
    expect(profile.data.email).toBe('ada@example.com');
    expect(profile.attributes.fullName).toBe('Ada Lovelace');
    expect(repository.profiles).toHaveLength(1);
  });
});

describe('ValidateProfileUseCase', () => {
  it('returns validation errors for malformed profiles', () => {
    const useCase = new ValidateProfileUseCase();

    const result = useCase.execute(makeProfileData({ email: 'not-an-email' }));

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'email' })]),
    );
  });
});

describe('SearchProfilesUseCase', () => {
  it('searches across identity, education, employment, address, and resume metadata', async () => {
    const repository = new InMemoryVaultRepository();
    const saveProfile = new SaveProfileUseCase(repository);
    await saveProfile.execute({
      label: 'Research',
      data: makeProfileData({
        resumeMetadata: {
          fileName: 'ada-research.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          sha256: 'a'.repeat(64),
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      }),
      passphrase: 'long-enough-passphrase',
    });

    const results = await new SearchProfilesUseCase(repository).execute({
      passphrase: 'long-enough-passphrase',
      query: 'research.pdf',
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.label).toBe('Research');
  });
});

describe('SwitchProfileUseCase', () => {
  it('returns the requested profile for profile switching', async () => {
    const repository = new InMemoryVaultRepository();
    const saved = await new SaveProfileUseCase(repository).execute({
      label: 'Default',
      data: makeProfileData(),
      passphrase: 'long-enough-passphrase',
    });

    const active = await new SwitchProfileUseCase(repository).execute({
      passphrase: 'long-enough-passphrase',
      profileId: saved.id,
    });

    expect(active.id).toBe(saved.id);
  });
});

describe('Import and export profile use cases', () => {
  it('exports encrypted bundle metadata and imports multiple profiles', async () => {
    const sourceRepository = new InMemoryVaultRepository();
    const cipher = new FakeVaultBundleCipher();
    await new SaveProfileUseCase(sourceRepository).execute({
      label: 'Default',
      data: makeProfileData(),
      passphrase: 'long-enough-passphrase',
    });

    const bundle = await new ExportProfilesUseCase(sourceRepository, cipher).execute({
      passphrase: 'long-enough-passphrase',
    });

    expect(bundle.version).toBe(1);
    expect(bundle.encryptedPayload).not.toContain('correct horse');
    expect(cipher.lastPayload?.profiles).toHaveLength(1);

    const targetRepository = new InMemoryVaultRepository();
    const result = await new ImportProfilesUseCase(targetRepository, cipher).execute({
      passphrase: 'long-enough-passphrase',
      bundle,
    });

    expect(result.imported).toBe(1);
    expect(targetRepository.profiles).toHaveLength(1);
  });
});
