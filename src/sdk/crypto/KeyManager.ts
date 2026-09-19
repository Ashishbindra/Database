/**
 * KeyManager - Secure Lifecycle Management for User Data Encryption Keys (DEK)
 * Responsible for:
 * - Session DEK memory management
 * - Wrapping / unwrapping DEK with Password-derived KEK
 * - BIP-39 24-word Recovery Phrase wrapping / unwrapping
 * - Immediate memory zeroing on session lock / logout
 */

import { WrappedKeyEnvelope } from "../types";
import { CryptoManager } from "./CryptoManager";
import { BIP39 } from "./bip39";

export class KeyManager {
  private activeDek: CryptoKey | null = null;
  private activeUserId: string | null = null;

  public setActiveSession(userId: string, dek: CryptoKey) {
    this.activeUserId = userId;
    this.activeDek = dek;
  }

  public getActiveDek(): CryptoKey {
    if (!this.activeDek) {
      throw new Error("Security Lock: No active encryption key unlocked in session. Please log in.");
    }
    return this.activeDek;
  }

  public getActiveUserId(): string {
    if (!this.activeUserId) {
      throw new Error("Security Lock: No active user session.");
    }
    return this.activeUserId;
  }

  public isUnlocked(): boolean {
    return this.activeDek !== null && this.activeUserId !== null;
  }

  public lockSession() {
    this.activeDek = null;
    this.activeUserId = null;
  }

  // Create User Key Bundle during Registration
  public static async createKeyBundle(password: string, recoveryWords: string[]): Promise<{
    saltHex: string;
    authProofHash: string;
    dek: CryptoKey;
    wrappedDek: WrappedKeyEnvelope;
    recoveryWrappedDek: WrappedKeyEnvelope;
  }> {
    // 1. Validate recovery words against BIP-39 checksum
    const validation = await BIP39.validateMnemonic(recoveryWords);
    if (!validation.valid) {
      throw new Error(`BIP-39 Validation Error: ${validation.reason}`);
    }

    const saltBytes = CryptoManager.getRandomBytes(32);
    const saltHex = CryptoManager.bytesToHex(saltBytes);

    // 2. Derive Password KEK (PBKDF2-SHA256, 600,000 iterations)
    const kek = await CryptoManager.deriveKEK(password, saltBytes);

    // 3. Generate Random DEK (256-bit AES-GCM key via WebCrypto)
    const dek = await CryptoManager.generateDEK();

    // 4. Wrap DEK with Password KEK
    const wrappedDek = await CryptoManager.wrapDEK(dek, kek);

    // 5. Derive Recovery KEK from BIP-39 256-bit seed
    const recoverySeed = await BIP39.mnemonicToSeed(recoveryWords);
    const recoveryKek = await CryptoManager.deriveKEK(CryptoManager.bytesToHex(recoverySeed), saltBytes, 100000);
    const recoveryWrappedDek = await CryptoManager.wrapDEK(dek, recoveryKek);

    // 6. Server Password Proof Hash
    const authProofHash = await CryptoManager.deriveAuthProofHash(password, saltHex);

    return {
      saltHex,
      authProofHash,
      dek,
      wrappedDek,
      recoveryWrappedDek,
    };
  }

  // Unlock DEK using User Password
  public static async unlockWithPassword(
    password: string,
    saltHex: string,
    wrappedDek: WrappedKeyEnvelope
  ): Promise<CryptoKey> {
    const saltBytes = CryptoManager.hexToBytes(saltHex);
    const kek = await CryptoManager.deriveKEK(password, saltBytes);
    return await CryptoManager.unwrapDEK(wrappedDek, kek);
  }

  // Unlock DEK using 24-Word Standard BIP-39 Recovery Phrase
  public static async unlockWithRecoveryWords(
    recoveryWords: string[],
    saltHex: string,
    recoveryWrappedDek: WrappedKeyEnvelope
  ): Promise<CryptoKey> {
    const validation = await BIP39.validateMnemonic(recoveryWords);
    if (!validation.valid) {
      throw new Error(`BIP-39 Recovery Error: ${validation.reason}`);
    }

    const saltBytes = CryptoManager.hexToBytes(saltHex);
    const recoverySeed = await BIP39.mnemonicToSeed(recoveryWords);
    const recoveryKek = await CryptoManager.deriveKEK(CryptoManager.bytesToHex(recoverySeed), saltBytes, 100000);
    return await CryptoManager.unwrapDEK(recoveryWrappedDek, recoveryKek);
  }
}
