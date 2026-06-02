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

  execute(settings: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
    if (settings.minConfidence !== undefined) {
      const value = settings.minConfidence;
      if (value < 0 || value > 1) {
        throw new Error('Minimum confidence must be between 0 and 1.');
      }
    }

    return this.repository.update(settings);
  }
}
