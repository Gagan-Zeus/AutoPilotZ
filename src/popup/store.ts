import { create } from 'zustand';
import type { AutofillSafetyBlock } from '../content/form-filling/AutofillSafetyPolicy';
import type { DomFieldSignal } from '../core/entities/Mapping';
import type { FieldMapping } from '../core/entities/Mapping';
import type { ExtensionSettings } from '../core/entities/Settings';
import type {
  ExportedVaultBundle,
  ProfileData,
  ProfileValidationResult,
  VaultProfile,
} from '../core/entities/Profile';
import { sendRuntimeMessage, sendTabMessage } from '../shared/messaging/messages';
import {
  createReviewItems,
  previewAttributeValue,
  reviewItemToFeedbackInputs,
  reviewItemToMapping,
  type MappingReviewItem,
} from './review';

interface PopupState {
  passphrase: string;
  profiles: VaultProfile[];
  selectedProfileId?: string;
  searchQuery: string;
  lastMappings: FieldMapping[];
  reviewItems: MappingReviewItem[];
  sensitiveBlocks: AutofillSafetyBlock[];
  exportBundle?: ExportedVaultBundle;
  status: string;
  loading: boolean;
  setPassphrase: (passphrase: string) => void;
  setSearchQuery: (query: string) => void;
  setStatus: (status: string) => void;
  loadProfiles: () => Promise<void>;
  saveProfile: (label: string, data: ProfileData, id?: string) => Promise<void>;
  selectProfile: (id: string) => void;
  switchProfile: (id: string) => Promise<void>;
  searchProfiles: (query: string) => Promise<void>;
  validateProfile: (data: ProfileData) => Promise<ProfileValidationResult>;
  exportProfiles: (profileIds?: string[]) => Promise<ExportedVaultBundle | undefined>;
  importProfiles: (bundle: ExportedVaultBundle, mode?: 'merge' | 'replace') => Promise<void>;
  mapActiveTab: () => Promise<void>;
  acceptReviewItem: (id: string) => void;
  rejectReviewItem: (id: string) => void;
  editReviewItem: (id: string, profileKey: string) => void;
  applyAcceptedMappings: () => Promise<void>;
  confirmSensitiveMappings: () => Promise<void>;
}

interface AutofillResult {
  applied: number;
  requiresConfirmation: AutofillSafetyBlock[];
  failed: Array<{ selector: string; profileKey: string; reason: string }>;
}

export const usePopupStore = create<PopupState>((set, get) => ({
  passphrase: '',
  profiles: [],
  selectedProfileId: undefined,
  searchQuery: '',
  lastMappings: [],
  reviewItems: [],
  sensitiveBlocks: [],
  exportBundle: undefined,
  status: 'Locked',
  loading: false,
  setPassphrase: (passphrase) => set({ passphrase }),
  setStatus: (status) => set({ status }),
  selectProfile: (id) => set({ selectedProfileId: id, reviewItems: [], sensitiveBlocks: [] }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  loadProfiles: async () => {
    set({ loading: true, status: 'Unlocking vault...' });
    try {
      const profiles = await sendRuntimeMessage<VaultProfile[]>({
        type: 'VAULT_LIST_PROFILES',
        passphrase: get().passphrase,
      });
      set({
        profiles,
        selectedProfileId: profiles[0]?.id,
        reviewItems: [],
        sensitiveBlocks: [],
        status: profiles.length ? `${profiles.length} profile loaded` : 'Vault is empty',
      });
    } catch (error) {
      set({ status: error instanceof Error ? error.message : 'Unable to load vault.' });
    } finally {
      set({ loading: false });
    }
  },
  saveProfile: async (label, data, id) => {
    set({ loading: true, status: 'Saving encrypted profile...' });
    try {
      await sendRuntimeMessage<VaultProfile>({
        type: 'VAULT_SAVE_PROFILE',
        passphrase: get().passphrase,
        profile: { id, label, data },
      });
      await get().loadProfiles();
    } catch (error) {
      set({ status: error instanceof Error ? error.message : 'Unable to save profile.' });
    } finally {
      set({ loading: false });
    }
  },
  switchProfile: async (id) => {
    set({ loading: true, status: 'Switching profile...' });
    try {
      const profile = await sendRuntimeMessage<VaultProfile>({
        type: 'VAULT_SWITCH_PROFILE',
        passphrase: get().passphrase,
        profileId: id,
      });
      set({
        selectedProfileId: profile.id,
        reviewItems: [],
        sensitiveBlocks: [],
        status: `Active profile: ${profile.label}`,
      });
    } catch (error) {
      set({ status: error instanceof Error ? error.message : 'Unable to switch profile.' });
    } finally {
      set({ loading: false });
    }
  },
  searchProfiles: async (query) => {
    set({ loading: true, searchQuery: query, status: 'Searching profiles...' });
    try {
      const profiles = await sendRuntimeMessage<VaultProfile[]>({
        type: 'VAULT_SEARCH_PROFILES',
        passphrase: get().passphrase,
        query,
      });
      set({
        profiles,
        selectedProfileId: profiles[0]?.id,
        reviewItems: [],
        sensitiveBlocks: [],
        status: `${profiles.length} profile${profiles.length === 1 ? '' : 's'} found`,
      });
    } catch (error) {
      set({ status: error instanceof Error ? error.message : 'Unable to search profiles.' });
    } finally {
      set({ loading: false });
    }
  },
  validateProfile: async (data) =>
    sendRuntimeMessage<ProfileValidationResult>({
      type: 'VAULT_VALIDATE_PROFILE',
      data,
    }),
  exportProfiles: async (profileIds) => {
    set({ loading: true, status: 'Exporting encrypted profiles...' });
    try {
      const bundle = await sendRuntimeMessage<ExportedVaultBundle>({
        type: 'VAULT_EXPORT_PROFILES',
        passphrase: get().passphrase,
        profileIds,
      });
      set({ exportBundle: bundle, status: 'Encrypted export ready' });
      return bundle;
    } catch (error) {
      set({ status: error instanceof Error ? error.message : 'Unable to export profiles.' });
      return undefined;
    } finally {
      set({ loading: false });
    }
  },
  importProfiles: async (bundle, mode = 'merge') => {
    set({ loading: true, status: 'Importing encrypted profiles...' });
    try {
      const result = await sendRuntimeMessage<{ imported: number; profiles: VaultProfile[] }>({
        type: 'VAULT_IMPORT_PROFILES',
        passphrase: get().passphrase,
        bundle,
        mode,
      });
      await get().loadProfiles();
      set({ status: `${result.imported} profile${result.imported === 1 ? '' : 's'} imported` });
    } catch (error) {
      set({ status: error instanceof Error ? error.message : 'Unable to import profiles.' });
    } finally {
      set({ loading: false });
    }
  },
  mapActiveTab: async () => {
    const selectedProfile = get().profiles.find(
      (profile) => profile.id === get().selectedProfileId,
    );
    if (!selectedProfile) {
      set({ status: 'Select a profile before mapping.' });
      return;
    }

    set({ loading: true, status: 'Reading page fields...' });
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) {
        throw new Error('No active tab found.');
      }
      await assertTabAllowed(tab);
      await ensureContentScript(tab.id);

      const fields = await sendTabMessage<DomFieldSignal[]>(tab.id, {
        type: 'CONTENT_EXTRACT_FIELDS',
      });
      const mappings = await sendRuntimeMessage<FieldMapping[]>({
        type: 'AI_MAP_FIELDS',
        fields,
        profileAttributes: selectedProfile.attributes,
      });
      const reviewItems = createReviewItems(fields, mappings, selectedProfile.attributes);

      set({
        lastMappings: mappings,
        reviewItems,
        sensitiveBlocks: [],
        status: `${reviewItems.length} mapping${reviewItems.length === 1 ? '' : 's'} ready for review`,
      });
    } catch (error) {
      set({ status: error instanceof Error ? error.message : 'Unable to map active tab.' });
    } finally {
      set({ loading: false });
    }
  },
  acceptReviewItem: (id) => {
    const item = get().reviewItems.find((candidate) => candidate.id === id);
    if (item) {
      void recordReviewFeedback(item, 'accepted');
    }
    set((state) => ({
      reviewItems: state.reviewItems.map((item) =>
        item.id === id ? { ...item, status: 'accepted' } : item,
      ),
    }));
  },
  rejectReviewItem: (id) => {
    const item = get().reviewItems.find((candidate) => candidate.id === id);
    if (item) {
      void recordReviewFeedback(item, 'rejected');
    }
    set((state) => ({
      reviewItems: state.reviewItems.map((item) =>
        item.id === id ? { ...item, status: 'rejected' } : item,
      ),
    }));
  },
  editReviewItem: (id, profileKey) => {
    const selectedProfile = get().profiles.find(
      (profile) => profile.id === get().selectedProfileId,
    );
    const attributes = selectedProfile?.attributes ?? {};
    const item = get().reviewItems.find((candidate) => candidate.id === id);
    if (item) {
      void recordReviewFeedback({ ...item, editedProfileKey: profileKey }, 'accepted');
    }
    set((state) => ({
      reviewItems: state.reviewItems.map((item) =>
        item.id === id
          ? {
              ...item,
              editedProfileKey: profileKey,
              valuePreview: previewAttributeValue(profileKey, attributes[profileKey]),
              status: 'accepted',
            }
          : item,
      ),
    }));
  },
  applyAcceptedMappings: async () => {
    const selectedProfile = get().profiles.find(
      (profile) => profile.id === get().selectedProfileId,
    );
    if (!selectedProfile) {
      set({ status: 'Select a profile before applying mappings.' });
      return;
    }

    const acceptedItems = get().reviewItems.filter((item) => item.status === 'accepted');
    if (acceptedItems.length === 0) {
      set({ status: 'Accept at least one mapping before applying.' });
      return;
    }

    set({ loading: true, status: 'Applying accepted mappings...' });
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) {
        throw new Error('No active tab found.');
      }
      await assertTabAllowed(tab);
      await ensureContentScript(tab.id);

      const acceptedMappings = acceptedItems.map(reviewItemToMapping);
      const result = await sendTabMessage<AutofillResult>(tab.id, {
        type: 'CONTENT_APPLY_MAPPINGS',
        mappings: acceptedMappings,
        values: selectedProfile.attributes,
      });

      set({
        lastMappings: acceptedMappings,
        sensitiveBlocks: result.requiresConfirmation,
        status:
          result.requiresConfirmation.length > 0
            ? `${result.applied} applied; ${result.requiresConfirmation.length} sensitive field${result.requiresConfirmation.length === 1 ? '' : 's'} require explicit confirmation`
            : `${result.applied} field${result.applied === 1 ? '' : 's'} applied`,
      });
    } catch (error) {
      set({ status: error instanceof Error ? error.message : 'Unable to apply mappings.' });
    } finally {
      set({ loading: false });
    }
  },
  confirmSensitiveMappings: async () => {
    const selectedProfile = get().profiles.find(
      (profile) => profile.id === get().selectedProfileId,
    );
    if (!selectedProfile) {
      set({ status: 'Select a profile before confirming sensitive mappings.' });
      return;
    }

    const sensitiveBlocks = get().sensitiveBlocks;
    if (sensitiveBlocks.length === 0) {
      set({ status: 'No sensitive mappings are waiting for confirmation.' });
      return;
    }

    const acceptedMappings = get()
      .reviewItems.filter((item) => item.status === 'accepted')
      .map(reviewItemToMapping);
    const blockedSelectors = new Set(sensitiveBlocks.map((block) => block.selector));
    const blockedMappings = acceptedMappings.filter((mapping) =>
      blockedSelectors.has(mapping.selector),
    );
    if (blockedMappings.length === 0) {
      set({ sensitiveBlocks: [], status: 'Sensitive mappings are no longer selected.' });
      return;
    }

    set({ loading: true, status: 'Applying confirmed sensitive mappings...' });
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) {
        throw new Error('No active tab found.');
      }
      await assertTabAllowed(tab);
      await ensureContentScript(tab.id);

      const result = await sendTabMessage<AutofillResult>(tab.id, {
        type: 'CONTENT_APPLY_MAPPINGS',
        mappings: blockedMappings,
        values: selectedProfile.attributes,
        confirmedSensitiveFieldIds: sensitiveBlocks
          .map((block) => block.fieldId)
          .filter((fieldId): fieldId is string => Boolean(fieldId)),
        confirmedSensitiveSelectors: sensitiveBlocks.map((block) => block.selector),
        confirmedSensitiveProfileKeys: sensitiveBlocks.map((block) => block.profileKey),
      });

      set({
        sensitiveBlocks: result.requiresConfirmation,
        status:
          result.requiresConfirmation.length > 0
            ? `${result.applied} applied; ${result.requiresConfirmation.length} sensitive field${result.requiresConfirmation.length === 1 ? '' : 's'} still blocked`
            : `${result.applied} confirmed sensitive field${result.applied === 1 ? '' : 's'} applied`,
      });
    } catch (error) {
      set({
        status: error instanceof Error ? error.message : 'Unable to confirm sensitive mappings.',
      });
    } finally {
      set({ loading: false });
    }
  },
}));

const recordReviewFeedback = async (
  item: MappingReviewItem,
  status: 'accepted' | 'rejected',
): Promise<void> => {
  const feedback = reviewItemToFeedbackInputs(item, status);
  if (feedback.length === 0) {
    return;
  }

  try {
    await sendRuntimeMessage({
      type: 'LEARNING_RECORD_FEEDBACK',
      feedback,
    });
  } catch {
    // Learning is opportunistic local state; review actions should still work if storage fails.
  }
};

const ensureContentScript = async (tabId: number): Promise<void> => {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/content-script.js'],
    });
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Unable to access this tab: ${error.message}`
        : 'Unable to access this tab.',
    );
  }
};

const assertTabAllowed = async (tab: chrome.tabs.Tab): Promise<void> => {
  const settings = await sendRuntimeMessage<ExtensionSettings>({ type: 'SETTINGS_GET' });
  if (settings.allowedOrigins.length === 0) {
    return;
  }

  const origin = originForTab(tab);
  if (!origin || !settings.allowedOrigins.includes(origin)) {
    throw new Error(
      `This tab is not in AutoPilotX allowed origins. Add ${origin ?? 'this origin'} in Options first.`,
    );
  }
};

const originForTab = (tab: chrome.tabs.Tab): string | undefined => {
  if (!tab.url) {
    return undefined;
  }

  try {
    const url = new URL(tab.url);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : undefined;
  } catch {
    return undefined;
  }
};
