import { create } from 'zustand';
import type { ExtensionSettings } from '../core/entities/Settings';
import { defaultSettings } from '../core/entities/Settings';
import { sendRuntimeMessage } from '../shared/messaging/messages';

interface OptionsState {
  settings: ExtensionSettings;
  status: string;
  loading: boolean;
  load: () => Promise<void>;
  save: (settings: Partial<ExtensionSettings>) => Promise<void>;
}

export const useOptionsStore = create<OptionsState>((set, get) => ({
  settings: defaultSettings,
  status: 'Ready',
  loading: false,
  load: async () => {
    set({ loading: true, status: 'Loading settings...' });
    try {
      const settings = await sendRuntimeMessage<ExtensionSettings>({ type: 'SETTINGS_GET' });
      set({ settings, status: 'Ready' });
    } catch (error) {
      set({ status: error instanceof Error ? error.message : 'Unable to load settings.' });
    } finally {
      set({ loading: false });
    }
  },
  save: async (settingsPatch) => {
    set({ loading: true, status: 'Saving settings...' });
    try {
      const settings = await sendRuntimeMessage<ExtensionSettings>({
        type: 'SETTINGS_UPDATE',
        settings: settingsPatch,
      });
      set({ settings: { ...get().settings, ...settings }, status: 'Settings saved' });
    } catch (error) {
      set({ status: error instanceof Error ? error.message : 'Unable to save settings.' });
    } finally {
      set({ loading: false });
    }
  },
}));
