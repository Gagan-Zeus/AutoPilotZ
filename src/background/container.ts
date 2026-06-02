import { ListProfilesUseCase } from '../core/usecases/ListProfilesUseCase';
import { MapFieldsUseCase } from '../core/usecases/MapFieldsUseCase';
import { RemoveProfileUseCase } from '../core/usecases/RemoveProfileUseCase';
import { SaveProfileUseCase } from '../core/usecases/SaveProfileUseCase';
import { ExportProfilesUseCase } from '../core/usecases/ExportProfilesUseCase';
import { ImportProfilesUseCase } from '../core/usecases/ImportProfilesUseCase';
import { SearchProfilesUseCase } from '../core/usecases/SearchProfilesUseCase';
import { GetSettingsUseCase, UpdateSettingsUseCase } from '../core/usecases/SettingsUseCases';
import { SwitchProfileUseCase } from '../core/usecases/SwitchProfileUseCase';
import { ValidateProfileUseCase } from '../core/usecases/ValidateProfileUseCase';
import { HeuristicAiMappingEngine } from '../infra/ai/HeuristicAiMappingEngine';
import { ChromeLocalStorageArea } from '../infra/chrome/ChromeStorageArea';
import { ChromeSettingsRepository } from '../infra/chrome/ChromeSettingsRepository';
import { IndexedDbProfileVaultRepository } from '../infra/indexeddb/IndexedDbProfileVaultRepository';
import { EncryptedVaultBundleCipher } from '../infra/security/EncryptedVaultBundleCipher';

export const createContainer = () => {
  const storage = new ChromeLocalStorageArea();
  const settingsRepository = new ChromeSettingsRepository(storage);
  const vaultRepository = new IndexedDbProfileVaultRepository(storage);
  const mappingEngine = new HeuristicAiMappingEngine();
  const vaultBundleCipher = new EncryptedVaultBundleCipher();

  return {
    listProfiles: new ListProfilesUseCase(vaultRepository),
    saveProfile: new SaveProfileUseCase(vaultRepository),
    removeProfile: new RemoveProfileUseCase(vaultRepository),
    searchProfiles: new SearchProfilesUseCase(vaultRepository),
    switchProfile: new SwitchProfileUseCase(vaultRepository),
    exportProfiles: new ExportProfilesUseCase(vaultRepository, vaultBundleCipher),
    importProfiles: new ImportProfilesUseCase(vaultRepository, vaultBundleCipher),
    validateProfile: new ValidateProfileUseCase(),
    mapFields: new MapFieldsUseCase(mappingEngine),
    getSettings: new GetSettingsUseCase(settingsRepository),
    updateSettings: new UpdateSettingsUseCase(settingsRepository),
  };
};
