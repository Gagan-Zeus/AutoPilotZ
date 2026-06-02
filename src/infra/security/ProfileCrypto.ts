const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface EncryptedPayload {
  encryptedPayload: string;
  iv: string;
}

export class ProfileCrypto {
  constructor(private readonly subtleCrypto: SubtleCrypto = crypto.subtle) {}

  async encryptJson(
    value: unknown,
    passphrase: string,
    salt: Uint8Array,
  ): Promise<EncryptedPayload> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this.deriveKey(passphrase, salt);
    const plaintext = encoder.encode(JSON.stringify(value));
    const encrypted = await this.subtleCrypto.encrypt(
      { name: 'AES-GCM', iv: this.toArrayBuffer(iv) },
      key,
      this.toArrayBuffer(plaintext),
    );

    return {
      encryptedPayload: this.toBase64(new Uint8Array(encrypted)),
      iv: this.toBase64(iv),
    };
  }

  async decryptJson<T>(
    payload: EncryptedPayload,
    passphrase: string,
    salt: Uint8Array,
  ): Promise<T> {
    const key = await this.deriveKey(passphrase, salt);
    const decrypted = await this.subtleCrypto.decrypt(
      { name: 'AES-GCM', iv: this.toArrayBuffer(this.fromBase64(payload.iv)) },
      key,
      this.toArrayBuffer(this.fromBase64(payload.encryptedPayload)),
    );

    return JSON.parse(decoder.decode(decrypted)) as T;
  }

  async deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
    const baseKey = await this.subtleCrypto.importKey(
      'raw',
      this.toArrayBuffer(encoder.encode(passphrase)),
      { name: 'PBKDF2' },
      false,
      ['deriveKey'],
    );

    return this.subtleCrypto.deriveKey(
      {
        name: 'PBKDF2',
        salt: this.toArrayBuffer(salt),
        iterations: 250000,
        hash: 'SHA-256',
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  }

  toBase64(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }

  fromBase64(value: string): Uint8Array {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  private toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }
}
