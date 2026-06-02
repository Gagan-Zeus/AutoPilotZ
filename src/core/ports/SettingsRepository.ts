import type { ExtensionSettings } from '../entities/Settings';

export interface SettingsRepository {
  get(): Promise<ExtensionSettings>;
  update(settings: Partial<ExtensionSettings>): Promise<ExtensionSettings>;
}
