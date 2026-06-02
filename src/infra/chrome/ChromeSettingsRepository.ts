import { defaultSettings, type ExtensionSettings } from '../../core/entities/Settings';
import type { SettingsRepository } from '../../core/ports/SettingsRepository';
import type { StorageArea } from './ChromeStorageArea';

const SETTINGS_KEY = 'autopilotx.settings';

export class ChromeSettingsRepository implements SettingsRepository {
  constructor(private readonly storage: StorageArea) {}

  async get(): Promise<ExtensionSettings> {
    const values =
      await this.storage.get<Record<string, ExtensionSettings | undefined>>(SETTINGS_KEY);
    return {
      ...defaultSettings,
      ...(values[SETTINGS_KEY] ?? {}),
    };
  }

  async update(settings: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
    const current = await this.get();
    const next = {
      ...current,
      ...settings,
      allowedOrigins: settings.allowedOrigins ?? current.allowedOrigins,
    };

    await this.storage.set({ [SETTINGS_KEY]: next });
    return next;
  }
}
