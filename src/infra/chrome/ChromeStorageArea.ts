export interface StorageArea {
  get<T>(keys?: string | string[] | Record<string, unknown> | null): Promise<T>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

export class ChromeLocalStorageArea implements StorageArea {
  get<T>(keys?: string | string[] | Record<string, unknown> | null): Promise<T> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys ?? null, (items) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }
        resolve(items as T);
      });
    });
  }

  set(items: Record<string, unknown>): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(items, () => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }
        resolve();
      });
    });
  }

  remove(keys: string | string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove(keys, () => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }
        resolve();
      });
    });
  }
}
