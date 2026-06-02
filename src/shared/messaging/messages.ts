import type { ExtensionSettings } from '../../core/entities/Settings';
import type { DomFieldSignal, FieldMapping } from '../../core/entities/Mapping';
import type {
  FieldExtractionResult,
  NormalizedFormExtraction,
} from '../../core/entities/FormExtraction';
import type {
  ExportedVaultBundle,
  ProfileData,
  ProfileValidationResult,
  VaultProfile,
} from '../../core/entities/Profile';

export type RuntimeMessage =
  | { type: 'VAULT_LIST_PROFILES'; passphrase: string }
  | {
      type: 'VAULT_SAVE_PROFILE';
      passphrase: string;
      profile: Pick<VaultProfile, 'label' | 'data'> & { id?: string };
    }
  | { type: 'VAULT_REMOVE_PROFILE'; id: string }
  | { type: 'VAULT_SEARCH_PROFILES'; passphrase: string; query: string }
  | { type: 'VAULT_SWITCH_PROFILE'; passphrase: string; profileId: string }
  | { type: 'VAULT_EXPORT_PROFILES'; passphrase: string; profileIds?: string[] }
  | {
      type: 'VAULT_IMPORT_PROFILES';
      passphrase: string;
      bundle: ExportedVaultBundle;
      mode?: 'merge' | 'replace';
    }
  | { type: 'VAULT_VALIDATE_PROFILE'; data: ProfileData }
  | {
      type: 'AI_MAP_FIELDS';
      fields: DomFieldSignal[];
      profileAttributes: VaultProfile['attributes'];
    }
  | { type: 'SETTINGS_GET' }
  | { type: 'SETTINGS_UPDATE'; settings: Partial<ExtensionSettings> };

export type ContentMessage =
  | { type: 'CONTENT_EXTRACT_FIELDS' }
  | { type: 'CONTENT_EXTRACT_FIELD_CONTEXTS' }
  | { type: 'CONTENT_EXTRACT_FORM_JSON' }
  | {
      type: 'CONTENT_APPLY_MAPPINGS';
      mappings: FieldMapping[];
      values: Record<string, string | number | boolean | readonly string[]>;
    };

export type RuntimeResponse<T> = { ok: true; data: T } | { ok: false; error: string };

export type ValidateProfileResponse = ProfileValidationResult;
export type ExtractFormJsonResponse = NormalizedFormExtraction;
export type ExtractFieldContextsResponse = FieldExtractionResult[];

export const sendRuntimeMessage = async <T>(message: RuntimeMessage): Promise<T> => {
  const response: RuntimeResponse<T> = await chrome.runtime.sendMessage(message);
  if (!response.ok) {
    throw new Error(response.error);
  }
  return response.data;
};

export const sendTabMessage = async <T>(tabId: number, message: ContentMessage): Promise<T> => {
  const response: RuntimeResponse<T> = await chrome.tabs.sendMessage(tabId, message);
  if (!response.ok) {
    throw new Error(response.error);
  }
  return response.data;
};
