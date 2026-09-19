/**
 * CryptoManager - Modern Web Crypto API Implementation
 * Algorithmic Standards:
 * - AES-256-GCM (Authenticated Encryption with Associated Data)
 * - PBKDF2-SHA256 (600,000 iterations, 32-byte random salt for password KEK)
 * - Cryptographically random 12-byte IV / Nonce per operation
 * - Integrity Digest via SHA-256
 * - BIP-39 256-bit entropy / 24-word recovery phrases
 */

import { EncryptedFileEnvelope, WrappedKeyEnvelope } from "../types";
import { BIP39 } from "./bip39";

export class CryptoManager {
  private static PBKDF2_ITERATIONS = 600000;

  // Convert Uint8Array <-> Hex
  public static bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  public static hexToBytes(hex: string): Uint8Array {
    const cleanHex = hex.replace(/[^0-9a-fA-F]/g, "");
    const bytes = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < cleanHex.length; i += 2) {
      bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
    }
    return bytes;
  }

  private static get cryptoObj(): Crypto {
    if (typeof globalThis !== "undefined" && globalThis.crypto) {
      return globalThis.crypto as Crypto;
    }
    if (typeof window !== "undefined" && window.crypto) {
      return window.crypto;
    }
    throw new Error("WebCrypto API is not available in current environment.");
  }

  // Generate cryptographically random bytes via WebCrypto getRandomValues
  public static getRandomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    this.cryptoObj.getRandomValues(bytes);
    return bytes;
  }

  // SHA-256 Hash Digest helper
  public static async sha256(data: string | Uint8Array): Promise<string> {
    const encoder = new TextEncoder();
    const buffer = typeof data === "string" ? encoder.encode(data) : data;
    const hashBuffer = await this.cryptoObj.subtle.digest("SHA-256", buffer as unknown as BufferSource);
    return this.bytesToHex(new Uint8Array(hashBuffer));
  }

  // Derive Key Encryption Key (KEK) using PBKDF2 (600,000 iterations)
  public static async deriveKEK(
    password: string,
    salt: Uint8Array,
    iterations = this.PBKDF2_ITERATIONS,
    extractable = false
  ): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const baseKey = await this.cryptoObj.subtle.importKey(
      "raw",
      encoder.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );

    return this.cryptoObj.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt as unknown as BufferSource,
        iterations,
        hash: "SHA-256",
      },
      baseKey,
      { name: "AES-GCM", length: 256 },
      extractable,
      ["encrypt", "decrypt", "wrapKey", "unwrapKey"]
    );
  }

  // Derive Server-Verified Password Proof
  public static async deriveAuthProofHash(password: string, saltHex: string): Promise<string> {
    const salt = this.hexToBytes(saltHex);
    const kek = await this.deriveKEK(password + "_auth_secret_v2", salt, 100000, true);
    const rawKey = await this.cryptoObj.subtle.exportKey("raw", kek);
    return this.sha256(new Uint8Array(rawKey));
  }

  // Derive Challenge-Bound One-Time Proof via HMAC-SHA256(authProofHash, challenge)
  public static async deriveChallengeProof(authProofHash: string, challenge: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await this.cryptoObj.subtle.importKey(
      "raw",
      encoder.encode(authProofHash),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await this.cryptoObj.subtle.sign("HMAC", key, encoder.encode(challenge));
    return this.bytesToHex(new Uint8Array(signature));
  }

  // Generate random 256-bit AES-GCM Data Encryption Key (DEK)
  public static async generateDEK(): Promise<CryptoKey> {
    return this.cryptoObj.subtle.generateKey(
      {
        name: "AES-GCM",
        length: 256,
      },
      true, // extractable so it can be wrapped and stored in memory
      ["encrypt", "decrypt"]
    );
  }

  // Export raw DEK bytes
  public static async exportDEKBytes(dek: CryptoKey): Promise<Uint8Array> {
    const rawBuffer = await this.cryptoObj.subtle.exportKey("raw", dek);
    return new Uint8Array(rawBuffer);
  }

  // Import raw DEK bytes
  public static async importDEKBytes(bytes: Uint8Array): Promise<CryptoKey> {
    return this.cryptoObj.subtle.importKey(
      "raw",
      bytes as unknown as BufferSource,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
  }

  // Wrap (Encrypt) DEK using KEK
  public static async wrapDEK(dek: CryptoKey, kek: CryptoKey): Promise<WrappedKeyEnvelope> {
    const iv = this.getRandomBytes(12); // 96-bit nonce for AES-GCM
    const wrappedBuffer = await this.cryptoObj.subtle.wrapKey("raw", dek, kek, {
      name: "AES-GCM",
      iv: iv as unknown as BufferSource,
    });

    return {
      algorithm: "AES-256-GCM",
      nonceHex: this.bytesToHex(iv),
      ciphertextHex: this.bytesToHex(new Uint8Array(wrappedBuffer)),
    };
  }

  // Unwrap (Decrypt) DEK using KEK
  public static async unwrapDEK(wrapped: WrappedKeyEnvelope, kek: CryptoKey): Promise<CryptoKey> {
    const iv = this.hexToBytes(wrapped.nonceHex);
    const wrappedBytes = this.hexToBytes(wrapped.ciphertextHex);

    try {
      return await this.cryptoObj.subtle.unwrapKey(
        "raw",
        wrappedBytes as unknown as BufferSource,
        kek,
        {
          name: "AES-GCM",
          iv: iv as unknown as BufferSource,
        },
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
      );
    } catch (err) {
      throw new Error("Failed to unwrap Data Encryption Key (DEK). Incorrect password or corrupted key envelope.");
    }
  }

  // Encrypt JSON Payload with DEK using AES-256-GCM and state versioning
  public static async encryptData<T>(
    payload: T,
    dek: CryptoKey,
    appId: string,
    userId: string,
    schemaVersion = 1,
    dataVersion = 1,
    previousStateHash = ""
  ): Promise<EncryptedFileEnvelope> {
    const salt = this.getRandomBytes(32);
    const nonce = this.getRandomBytes(12); // 96-bit AES-GCM IV

    const stateHash = await this.sha256(JSON.stringify(payload) + dataVersion + appId + userId);

    const metadata = {
      appId,
      userId,
      schemaVersion,
      dataVersion,
      stateHash,
      previousStateHash,
      timestamp: new Date().toISOString(),
    };

    const fullPayload = JSON.stringify({
      metadata,
      payload,
    });

    const encoder = new TextEncoder();
    const encodedPayload = encoder.encode(fullPayload);

    // Encrypt with AES-GCM
    const ciphertextBuffer = await this.cryptoObj.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: nonce as unknown as BufferSource,
      },
      dek,
      encodedPayload as unknown as BufferSource
    );

    const ciphertextHex = this.bytesToHex(new Uint8Array(ciphertextBuffer));
    const checksumHex = await this.sha256(ciphertextHex + appId + userId + stateHash);

    return {
      formatVersion: 1,
      appId,
      userId,
      schemaVersion,
      dataVersion,
      stateHash,
      previousStateHash,
      createdAt: metadata.timestamp,
      updatedAt: metadata.timestamp,
      encryption: {
        algorithm: "AES-256-GCM",
        nonceHex: this.bytesToHex(nonce),
        saltHex: this.bytesToHex(salt),
        iterations: this.PBKDF2_ITERATIONS,
      },
      ciphertextHex,
      checksumHex,
    };
  }

  // Decrypt EncryptedFileEnvelope with DEK
  public static async decryptData<T>(
    envelope: EncryptedFileEnvelope,
    dek: CryptoKey,
    expectedAppId: string,
    expectedUserId: string
  ): Promise<{ metadata: any; payload: T }> {
    // 1. Verify App-ID and User-ID metadata bounds before decryption
    if (envelope.appId !== expectedAppId) {
      throw new Error(`App Isolation Violation: Envelope belongs to app '${envelope.appId}', but current app context is '${expectedAppId}'.`);
    }
    if (envelope.userId !== expectedUserId) {
      throw new Error(`User Isolation Violation: Envelope belongs to user '${envelope.userId}', but active user context is '${expectedUserId}'.`);
    }

    // 2. Verify SHA-256 Checksum
    const stateHash = envelope.stateHash || "";
    const expectedChecksum = await this.sha256(envelope.ciphertextHex + expectedAppId + expectedUserId + stateHash);
    if (envelope.checksumHex && envelope.checksumHex !== expectedChecksum) {
      throw new Error("Integrity Verification Failed: Ciphertext checksum or state hash mismatch.");
    }

    // 3. Decrypt Ciphertext with AES-256-GCM
    const nonce = this.hexToBytes(envelope.encryption.nonceHex);
    const ciphertextBytes = this.hexToBytes(envelope.ciphertextHex);

    try {
      const decryptedBuffer = await this.cryptoObj.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: nonce as unknown as BufferSource,
        },
        dek,
        ciphertextBytes as unknown as BufferSource
      );

      const decoder = new TextDecoder();
      const jsonStr = decoder.decode(decryptedBuffer);
      const parsed = JSON.parse(jsonStr);

      // 4. Verify Authenticated Payload Metadata inside Ciphertext
      if (!parsed.metadata || parsed.metadata.appId !== expectedAppId || parsed.metadata.userId !== expectedUserId) {
        throw new Error("Inner Ciphertext Tampering Detected: Authenticated payload metadata mismatch.");
      }

      return parsed;
    } catch (err: any) {
      throw new Error(`Decryption Failed: ${err.message || "Invalid key or corrupted AEAD payload."}`);
    }
  }

  // Generate standard 24-word BIP-39 recovery phrase (256-bit entropy + 8-bit SHA-256 checksum)
  public static async generateRecoveryWords(): Promise<string[]> {
    return BIP39.generateMnemonic();
  }

  // Validate 24-word BIP-39 recovery phrase
  public static async validateRecoveryWords(words: string[]): Promise<{ valid: boolean; reason?: string }> {
    return BIP39.validateMnemonic(words);
  }
}
