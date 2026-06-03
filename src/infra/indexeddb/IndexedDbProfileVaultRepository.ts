import type { EncryptedProfileRecord, VaultProfile } from '../../core/entities/Profile';
import { profileDataToAttributes } from '../../core/entities/Profile';
import type { ProfileVaultRepository } from '../../core/ports/ProfileVaultRepository';
import type { StorageArea } from '../chrome/ChromeStorageArea';
import { ProfileCrypto } from '../security/ProfileCrypto';

const DATABASE_NAME = 'autopilotx-vault';
const DATABASE_VERSION = 1;
const STORE_NAME = 'profiles';
const SALT_KEY = 'autopilotx.vaultSalt';

export class IndexedDbProfileVaultRepository implements ProfileVaultRepository {
  private saltPromise?: Promise<Uint8Array>;

  constructor(
    private readonly storage: StorageArea,
    private readonly profileCrypto = new ProfileCrypto(),
  ) {}

  async list(passphrase: string): Promise<VaultProfile[]> {
    const db = await this.openDatabase();
    try {
      const records = await this.getAllRecords(db);
      const salt = await this.getOrCreateSalt();
      const profiles = await Promise.all(
        records.map((record) =>
          this.profileCrypto.decryptJson<VaultProfile>(
            { encryptedPayload: record.encryptedPayload, iv: record.iv },
            passphrase,
            salt,
          ),
        ),
      );

      return profiles
        .map((profile) => ({
          ...profile,
          attributes: profileDataToAttributes(profile.data),
        }))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    } finally {
      db.close();
    }
  }

  async save(profile: VaultProfile, passphrase: string): Promise<VaultProfile> {
    const db = await this.openDatabase();
    try {
      const salt = await this.getOrCreateSalt();
      const encrypted = await this.profileCrypto.encryptJson(profile, passphrase, salt);
      const record: EncryptedProfileRecord = {
        id: profile.id,
        encryptedPayload: encrypted.encryptedPayload,
        iv: encrypted.iv,
        updatedAt: profile.updatedAt,
      };

      await this.putRecord(db, record);
      return profile;
    } finally {
      db.close();
    }
  }

  async remove(id: string): Promise<void> {
    const db = await this.openDatabase();
    try {
      await this.deleteRecord(db, id);
    } finally {
      db.close();
    }
  }

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Unable to open IndexedDB vault.'));
    });
  }

  private getAllRecords(db: IDBDatabase): Promise<EncryptedProfileRecord[]> {
    return this.withStore<EncryptedProfileRecord[]>(db, 'readonly', (store, resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result as EncryptedProfileRecord[]);
      request.onerror = () => reject(request.error ?? new Error('Unable to read vault records.'));
    });
  }

  private putRecord(db: IDBDatabase, record: EncryptedProfileRecord): Promise<void> {
    return this.withStore<void>(db, 'readwrite', (store, resolve, reject) => {
      const request = store.put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error('Unable to save vault record.'));
    });
  }

  private deleteRecord(db: IDBDatabase, id: string): Promise<void> {
    return this.withStore<void>(db, 'readwrite', (store, resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error('Unable to delete vault record.'));
    });
  }

  private withStore<T>(
    db: IDBDatabase,
    mode: IDBTransactionMode,
    operation: (
      store: IDBObjectStore,
      resolve: (value: T) => void,
      reject: (reason?: unknown) => void,
    ) => void,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      operation(store, resolve, reject);
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    });
  }

  private async getOrCreateSalt(): Promise<Uint8Array> {
    this.saltPromise ??= this.readOrCreateSalt();
    return this.saltPromise;
  }

  private async readOrCreateSalt(): Promise<Uint8Array> {
    const stored = await this.storage.get<Record<string, string | undefined>>(SALT_KEY);
    const existing = stored[SALT_KEY];
    if (existing) {
      return this.profileCrypto.fromBase64(existing);
    }

    const salt = crypto.getRandomValues(new Uint8Array(16));
    await this.storage.set({ [SALT_KEY]: this.profileCrypto.toBase64(salt) });
    return salt;
  }
}
