import { create } from 'zustand';
import type { DomFieldSignal } from '../core/entities/Mapping';
import type { FieldMapping } from '../core/entities/Mapping';
import type { VaultProfile } from '../core/entities/Profile';
import { sendRuntimeMessage, sendTabMessage } from '../shared/messaging/messages';

interface PopupState {
  passphrase: string;
  profiles: VaultProfile[];
  selectedProfileId?: string;
  lastMappings: FieldMapping[];
  status: string;
  loading: boolean;
  setPassphrase: (passphrase: string) => void;
  loadProfiles: () => Promise<void>;
  saveProfile: (label: string, attributes: VaultProfile['attributes']) => Promise<void>;
  selectProfile: (id: string) => void;
  mapActiveTab: () => Promise<void>;
}

export const usePopupStore = create<PopupState>((set, get) => ({
  passphrase: '',
  profiles: [],
  selectedProfileId: undefined,
  lastMappings: [],
  status: 'Locked',
  loading: false,
  setPassphrase: (passphrase) => set({ passphrase }),
  selectProfile: (id) => set({ selectedProfileId: id }),
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
        status: profiles.length ? `${profiles.length} profile loaded` : 'Vault is empty',
      });
    } catch (error) {
      set({ status: error instanceof Error ? error.message : 'Unable to load vault.' });
    } finally {
      set({ loading: false });
    }
  },
  saveProfile: async (label, attributes) => {
    set({ loading: true, status: 'Saving encrypted profile...' });
    try {
      await sendRuntimeMessage<VaultProfile>({
        type: 'VAULT_SAVE_PROFILE',
        passphrase: get().passphrase,
        profile: { label, attributes },
      });
      await get().loadProfiles();
    } catch (error) {
      set({ status: error instanceof Error ? error.message : 'Unable to save profile.' });
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
      const result = await sendTabMessage<{ applied: number }>(tab.id, {
        type: 'CONTENT_APPLY_MAPPINGS',
        mappings,
        values: selectedProfile.attributes,
      });

      set({
        lastMappings: mappings,
        status: `${result.applied} field${result.applied === 1 ? '' : 's'} applied`,
      });
    } catch (error) {
      set({ status: error instanceof Error ? error.message : 'Unable to map active tab.' });
    } finally {
      set({ loading: false });
    }
  },
}));
