import { createContainer } from './container';
import type { RuntimeMessage, RuntimeResponse } from '../shared/messaging/messages';

const container = createContainer();

chrome.runtime.onInstalled.addListener(() => {
  void container.updateSettings.execute({});
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  void handleMessage(message)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error: unknown) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : 'Unexpected AutoPilotX error.',
      }),
    );

  return true;
});

async function handleMessage(message: RuntimeMessage): Promise<unknown> {
  switch (message.type) {
    case 'VAULT_LIST_PROFILES':
      return container.listProfiles.execute(message.passphrase);
    case 'VAULT_SAVE_PROFILE':
      return container.saveProfile.execute({
        ...message.profile,
        passphrase: message.passphrase,
      });
    case 'VAULT_REMOVE_PROFILE':
      return container.removeProfile.execute(message.id);
    case 'VAULT_SEARCH_PROFILES':
      return container.searchProfiles.execute({
        passphrase: message.passphrase,
        query: message.query,
      });
    case 'VAULT_SWITCH_PROFILE':
      return container.switchProfile.execute({
        passphrase: message.passphrase,
        profileId: message.profileId,
      });
    case 'VAULT_EXPORT_PROFILES':
      return container.exportProfiles.execute({
        passphrase: message.passphrase,
        profileIds: message.profileIds,
      });
    case 'VAULT_IMPORT_PROFILES':
      return container.importProfiles.execute({
        passphrase: message.passphrase,
        bundle: message.bundle,
        mode: message.mode,
      });
    case 'VAULT_VALIDATE_PROFILE':
      return container.validateProfile.execute(message.data);
    case 'AI_MAP_FIELDS': {
      const settings = await container.getSettings.execute();
      if (!settings.aiMappingEnabled) {
        return [];
      }
      const request = {
        fields: message.fields,
        profileAttributes: message.profileAttributes,
        minConfidence: settings.minConfidence,
      };
      const mappings = await container.mapFields.execute(request);
      return container.applyMappingFeedback.execute({
        ...request,
        mappings,
      });
    }
    case 'LEARNING_RECORD_FEEDBACK':
      return container.recordMappingFeedback.execute(message.feedback);
    case 'LEARNING_LIST_FEEDBACK':
      return container.listMappingFeedback.execute();
    case 'LEARNING_CLEAR_FEEDBACK':
      return container.clearMappingFeedback.execute();
    case 'SETTINGS_GET':
      return container.getSettings.execute();
    case 'SETTINGS_UPDATE':
      return container.updateSettings.execute(message.settings);
    default:
      return assertNever(message);
  }
}

function assertNever(value: never): RuntimeResponse<never> {
  throw new Error(`Unsupported message: ${JSON.stringify(value)}`);
}
