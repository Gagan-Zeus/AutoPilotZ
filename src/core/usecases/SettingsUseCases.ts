import type { ExtensionSettings } from '../entities/Settings';
import type { SettingsRepository } from '../ports/SettingsRepository';

export class GetSettingsUseCase {
  constructor(private readonly repository: SettingsRepository) {}

  execute(): Promise<ExtensionSettings> {
    return this.repository.get();
  }
}

export class UpdateSettingsUseCase {
  constructor(private readonly repository: SettingsRepository) {}

  async execute(settings: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
    if (settings.minConfidence !== undefined) {
      const value = settings.minConfidence;
      if (value < 0 || value > 1) {
        throw new Error('Minimum confidence must be between 0 and 1.');
      }
    }

    return await this.repository.update({
      ...settings,
      allowedOrigins:
        settings.allowedOrigins === undefined
          ? undefined
          : normalizeAllowedOrigins(settings.allowedOrigins),
    });
  }
}

const normalizeAllowedOrigins = (origins: string[]): string[] => {
  const normalized = origins.map((origin) => normalizeOrigin(origin)).filter(Boolean);
  return [...new Set(normalized)];
};

const normalizeOrigin = (origin: string): string => {
  const trimmed = origin.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('Allowed origins must use http or https.');
    }
    return parsed.origin;
  } catch (error) {
    throw new Error(
      error instanceof Error && error.message === 'Allowed origins must use http or https.'
        ? error.message
        : `Invalid allowed origin: ${origin}`,
    );
  }
};
