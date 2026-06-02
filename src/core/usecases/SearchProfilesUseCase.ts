import type { VaultProfile } from '../entities/Profile';
import type { ProfileVaultRepository } from '../ports/ProfileVaultRepository';

export interface SearchProfilesCommand {
  passphrase: string;
  query: string;
}

export class SearchProfilesUseCase {
  constructor(private readonly repository: ProfileVaultRepository) {}

  async execute(command: SearchProfilesCommand): Promise<VaultProfile[]> {
    const query = command.query.trim().toLowerCase();
    const profiles = await this.repository.list(command.passphrase);
    if (!query) {
      return profiles;
    }

    return profiles.filter((profile) => searchableProfileText(profile).includes(query));
  }
}

const searchableProfileText = (profile: VaultProfile): string =>
  [
    profile.label,
    profile.data.firstName,
    profile.data.middleName,
    profile.data.lastName,
    profile.data.preferredName,
    profile.data.email,
    profile.data.phone,
    profile.data.alternatePhone,
    profile.data.nationality,
    profile.data.address.lines.join(' '),
    profile.data.address.city,
    profile.data.address.state,
    profile.data.address.postalCode,
    profile.data.address.country,
    profile.data.linkedIn,
    profile.data.github,
    profile.data.portfolio,
    ...profile.data.education.flatMap((entry) => [
      entry.institution,
      entry.degree,
      entry.fieldOfStudy,
      entry.notes ?? '',
    ]),
    ...profile.data.employment.flatMap((entry) => [
      entry.company,
      entry.title,
      entry.location ?? '',
      entry.summary ?? '',
    ]),
    profile.data.resumeMetadata?.fileName ?? '',
  ]
    .join(' ')
    .toLowerCase();
