import { ListProfilesUseCase } from '../core/usecases/ListProfilesUseCase';
import { MapFieldsUseCase } from '../core/usecases/MapFieldsUseCase';
import { RemoveProfileUseCase } from '../core/usecases/RemoveProfileUseCase';
import { SaveProfileUseCase } from '../core/usecases/SaveProfileUseCase';
import { GetSettingsUseCase, UpdateSettingsUseCase } from '../core/usecases/SettingsUseCases';
import { HeuristicAiMappingEngine } from '../infra/ai/HeuristicAiMappingEngine';
import { ChromeLocalStorageArea } from '../infra/chrome/ChromeStorageArea';
import { ChromeSettingsRepository } from '../infra/chrome/ChromeSettingsRepository';
import { IndexedDbProfileVaultRepository } from '../infra/indexeddb/IndexedDbProfileVaultRepository';

export const createContainer = () => {
  const storage = new ChromeLocalStorageArea();
  const settingsRepository = new ChromeSettingsRepository(storage);
  const vaultRepository = new IndexedDbProfileVaultRepository(storage);
  const mappingEngine = new HeuristicAiMappingEngine();

  return {
    listProfiles: new ListProfilesUseCase(vaultRepository),
    saveProfile: new SaveProfileUseCase(vaultRepository),
    removeProfile: new RemoveProfileUseCase(vaultRepository),
    mapFields: new MapFieldsUseCase(mappingEngine),
    getSettings: new GetSettingsUseCase(settingsRepository),
    updateSettings: new UpdateSettingsUseCase(settingsRepository),
  };
};
