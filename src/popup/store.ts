import { create } from 'zustand';
import type { DomFieldSignal } from '../core/entities/Mapping';
import type { FieldMapping } from '../core/entities/Mapping';
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
  exportBundle?: ExportedVaultBundle;
  status: string;
  loading: boolean;
  setPassphrase: (passphrase: string) => void;
  setSearchQuery: (query: string) => void;
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
}

export const usePopupStore = create<PopupState>((set, get) => ({
  passphrase: '',
  profiles: [],
  selectedProfileId: undefined,
  searchQuery: '',
  lastMappings: [],
  reviewItems: [],
  exportBundle: undefined,
  status: 'Locked',
  loading: false,
  setPassphrase: (passphrase) => set({ passphrase }),
  selectProfile: (id) => set({ selectedProfileId: id, reviewItems: [] }),
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

      const acceptedMappings = acceptedItems.map(reviewItemToMapping);
      const result = await sendTabMessage<{ applied: number; requiresConfirmation: unknown[] }>(
        tab.id,
        {
          type: 'CONTENT_APPLY_MAPPINGS',
          mappings: acceptedMappings,
          values: selectedProfile.attributes,
          confirmedSensitiveFieldIds: acceptedItems
            .map((item) => item.fieldId)
            .filter((fieldId): fieldId is string => Boolean(fieldId)),
          confirmedSensitiveSelectors: acceptedItems.map((item) => item.selector),
          confirmedSensitiveProfileKeys: acceptedItems.map((item) => item.editedProfileKey),
        },
      );

      set({
        lastMappings: acceptedMappings,
        status:
          result.requiresConfirmation.length > 0
            ? `${result.applied} applied; ${result.requiresConfirmation.length} still require confirmation`
            : `${result.applied} field${result.applied === 1 ? '' : 's'} applied`,
      });
    } catch (error) {
      set({ status: error instanceof Error ? error.message : 'Unable to apply mappings.' });
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
