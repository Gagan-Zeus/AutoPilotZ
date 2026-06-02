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
    case 'AI_MAP_FIELDS': {
      const settings = await container.getSettings.execute();
      if (!settings.aiMappingEnabled) {
        return [];
      }
      return container.mapFields.execute({
        fields: message.fields,
        profileAttributes: message.profileAttributes,
        minConfidence: settings.minConfidence,
      });
    }
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
