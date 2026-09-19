/**
 * BIP-39 Standard Cryptographic Mnemonic Implementation
 * Specification:
 * - 256-bit entropy via window.crypto.getRandomValues()
 * - 8-bit SHA-256 checksum
 * - Total 264 bits -> 24 words from 2,048-word English dictionary
 * - Checksum validation on recovery
 * - Mnemonic to seed derivation via PBKDF2-SHA512 (2048 iterations)
 */

import { BIP39_ENGLISH_WORDLIST } from "./bip39English";

export class BIP39 {
  private static WORDLIST = BIP39_ENGLISH_WORDLIST;

  // Convert Uint8Array to binary string
  private static bytesToBinary(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((b) => b.toString(2).padStart(8, "0"))
      .join("");
  }

  // Convert binary string to Uint8Array
  private static binaryToBytes(binary: string): Uint8Array {
    const bytes = new Uint8Array(binary.length / 8);
    for (let i = 0; i < binary.length; i += 8) {
      bytes[i / 8] = parseInt(binary.substring(i, i + 8), 2);
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

  // Generate SHA-256 hash byte array
  private static async sha256Bytes(bytes: Uint8Array): Promise<Uint8Array> {
    const hashBuffer = await this.cryptoObj.subtle.digest("SHA-256", bytes as unknown as BufferSource);
    return new Uint8Array(hashBuffer);
  }

  /**
   * Generate 24-word BIP-39 recovery phrase from 256-bit entropy
   */
  public static async generateMnemonic(): Promise<string[]> {
    // 1. Generate 256 bits (32 bytes) of cryptographically secure random entropy
    const entropy = new Uint8Array(32);
    this.cryptoObj.getRandomValues(entropy);

    // 2. Compute SHA-256 checksum (256 / 32 = 8 checksum bits)
    const hash = await this.sha256Bytes(entropy);
    const checksumBits = this.bytesToBinary(hash).substring(0, 8);

    // 3. Concatenate entropy bits and checksum bits -> 264 bits
    const entropyBits = this.bytesToBinary(entropy);
    const combinedBits = entropyBits + checksumBits;

    // 4. Split 264 bits into 24 chunks of 11 bits each
    const words: string[] = [];
    for (let i = 0; i < 24; i++) {
      const bitChunk = combinedBits.substring(i * 11, (i + 1) * 11);
      const index = parseInt(bitChunk, 2);
      words.push(this.WORDLIST[index]);
    }

    return words;
  }

  /**
   * Validate 24-word mnemonic checksum and wordlist membership
   */
  public static async validateMnemonic(mnemonicWords: string[]): Promise<{ valid: boolean; reason?: string }> {
    if (!Array.isArray(mnemonicWords) || mnemonicWords.length !== 24) {
      return { valid: false, reason: "Mnemonic must consist of exactly 24 words." };
    }

    // 1. Verify every word exists in BIP-39 wordlist and obtain 11-bit index
    const bitChunks: string[] = [];
    for (const word of mnemonicWords) {
      const cleanWord = word.trim().toLowerCase();
      const index = this.WORDLIST.indexOf(cleanWord);
      if (index === -1) {
        return { valid: false, reason: `Word '${word}' is not in the official BIP-39 English dictionary.` };
      }
      bitChunks.push(index.toString(2).padStart(11, "0"));
    }

    // 2. Reconstruct combined 264 bits
    const combinedBits = bitChunks.join("");
    const entropyBits = combinedBits.substring(0, 256);
    const checksumBits = combinedBits.substring(256, 264);

    // 3. Recompute SHA-256 checksum of entropy
    const entropy = this.binaryToBytes(entropyBits);
    const hash = await this.sha256Bytes(entropy);
    const recomputedChecksumBits = this.bytesToBinary(hash).substring(0, 8);

    if (checksumBits !== recomputedChecksumBits) {
      return { valid: false, reason: "BIP-39 Checksum Validation Failed: Mnemonic phrase is corrupted or misordered." };
    }

    return { valid: true };
  }

  /**
   * Derive 512-bit (64-byte) seed from BIP-39 mnemonic phrase via PBKDF2-SHA512 (2048 iterations)
   */
  public static async mnemonicToSeed(mnemonicWords: string[], passphrase = ""): Promise<Uint8Array> {
    const mnemonicStr = mnemonicWords.map((w) => w.trim().toLowerCase()).join(" ");
    const encoder = new TextEncoder();
    
    const baseKey = await this.cryptoObj.subtle.importKey(
      "raw",
      encoder.encode(mnemonicStr),
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );

    const salt = encoder.encode("mnemonic" + passphrase);
    
    // Official BIP-39 specification: PBKDF2 with SHA-512, 2048 iterations, 512 bits (64 bytes)
    const derivedBuffer = await this.cryptoObj.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: salt as unknown as BufferSource,
        iterations: 2048,
        hash: "SHA-512",
      },
      baseKey,
      512
    );

    return new Uint8Array(derivedBuffer);
  }
}
