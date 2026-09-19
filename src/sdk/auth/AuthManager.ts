/**
 * AuthManager - Cryptographic User Authentication & Account Recovery Engine
 * Implements:
 * - Server-Verified Password Authentication
 * - Account Registration with PBKDF2 Salt & DEK Generation
 * - Standard 24-Word BIP-39 Recovery Phrase Key Unwrapping
 * - Secure Session Management & IndexedDB Logout Cleanup
 */

import { CryptoManager } from "../crypto/CryptoManager";
import { KeyManager } from "../crypto/KeyManager";
import { IndexedDBStorage } from "../storage/IndexedDBStorage";
import { UserProfileRemote } from "../types";

function getApiUrl(endpoint: string): string {
  if (endpoint.startsWith("http://") || endpoint.startsWith("https://")) return endpoint;
  if (typeof window !== "undefined" && window.location && window.location.origin) {
    return `${window.location.origin}${endpoint}`;
  }
  return `http://localhost:3000${endpoint}`;
}

export class AuthManager {
  private keyManager: KeyManager;
  private localDb: IndexedDBStorage;
  private currentUserProfile: UserProfileRemote | null = null;
  private sessionToken: string | null = null;

  constructor(keyManager: KeyManager, localDb: IndexedDBStorage) {
    this.keyManager = keyManager;
    this.localDb = localDb;
  }

  public getCurrentProfile(): UserProfileRemote | null {
    return this.currentUserProfile;
  }

  public getSessionToken(): string | null {
    return this.sessionToken;
  }

  public isLoggedIn(): boolean {
    return this.keyManager.isUnlocked() && this.currentUserProfile !== null;
  }

  // Register New User Account
  public async register(username: string, password: string): Promise<{
    profile: UserProfileRemote;
    recoveryWords: string[];
    sessionToken: string;
  }> {
    if (!username || username.trim().length < 3) {
      throw new Error("Registration Error: Username must be at least 3 characters.");
    }
    if (!password || password.length < 6) {
      throw new Error("Registration Error: Password must be at least 6 characters.");
    }

    const cleanUsername = username.trim().toLowerCase();

    // 1. Generate 24-Word Standard BIP-39 Recovery Phrase (256-bit entropy + 8-bit checksum)
    const recoveryWords = await CryptoManager.generateRecoveryWords();

    // 2. Generate Keys & Envelopes
    const { saltHex, authProofHash, dek, wrappedDek, recoveryWrappedDek } =
      await KeyManager.createKeyBundle(password, recoveryWords);

    // 3. Opaque User ID derived cryptographically
    const randomSeed = CryptoManager.bytesToHex(CryptoManager.getRandomBytes(16));
    const opaqueUserId = `u_${(await CryptoManager.sha256(cleanUsername + randomSeed)).substring(0, 16)}`;

    // 4. Register via Server Vault Proxy (/api/vault/register)
    const res = await fetch(getApiUrl("/api/vault/register"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: cleanUsername,
        opaqueUserId,
        saltHex,
        authProofHash,
        wrappedDek,
        recoveryWrappedDek,
      }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(`Registration Failed: ${errJson.message || res.statusText}`);
    }

    const resData = await res.json();
    this.sessionToken = resData.sessionToken;

    const profile: UserProfileRemote = {
      userId: opaqueUserId,
      username: cleanUsername,
      saltHex,
      authProofHash,
      wrappedDek,
      recoveryWrappedDek,
      recoveryWordsCount: 24,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      schemaVersion: 1,
    };

    // 5. Unlock KeyManager Session & Set Active State
    this.keyManager.setActiveSession(opaqueUserId, dek);
    this.currentUserProfile = profile;

    return { profile, recoveryWords, sessionToken: this.sessionToken! };
  }

  // Login with Username & Password
  public async login(username: string, password: string): Promise<UserProfileRemote> {
    const cleanUsername = username.trim().toLowerCase();

    // 1. Fetch auth params from Server Vault Proxy (/api/vault/auth-params)
    const paramRes = await fetch(getApiUrl("/api/vault/auth-params"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: cleanUsername }),
    });

    if (!paramRes.ok) {
      throw new Error(`Login Error: Account '${cleanUsername}' not found.`);
    }

    const { opaqueUserId, saltHex } = await paramRes.json();

    // 2. Compute Server Password Proof & Request One-Time Server Challenge
    const authProofHash = await CryptoManager.deriveAuthProofHash(password, saltHex);

    const challengeRes = await fetch(getApiUrl("/api/vault/auth-challenge"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opaqueUserId }),
    });

    if (!challengeRes.ok) {
      throw new Error("Login Error: Failed to obtain server login challenge.");
    }

    const { challengeId, challenge } = await challengeRes.json();

    // 3. Derive One-Time Challenge Proof and Authenticate (/api/vault/login)
    const challengeProof = await CryptoManager.deriveChallengeProof(authProofHash, challenge);

    const loginRes = await fetch(getApiUrl("/api/vault/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opaqueUserId, challengeId, challengeProof }),
    });

    if (!loginRes.ok) {
      throw new Error("Login Error: Incorrect password or invalid account proof.");
    }

    const loginData = await loginRes.json();
    this.sessionToken = loginData.sessionToken;

    // 4. Unwrap DEK locally in client memory using Password
    const dek = await KeyManager.unlockWithPassword(password, saltHex, loginData.wrappedDek);

    const profile: UserProfileRemote = {
      userId: opaqueUserId,
      username: cleanUsername,
      saltHex,
      authProofHash,
      wrappedDek: loginData.wrappedDek,
      recoveryWrappedDek: loginData.recoveryWrappedDek,
      recoveryWordsCount: 24,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      schemaVersion: 1,
    };

    // 5. Unlock Session
    this.keyManager.setActiveSession(opaqueUserId, dek);
    this.currentUserProfile = profile;

    return profile;
  }

  // Recover Account using 24-Word BIP-39 Recovery Phrase
  public async recoverWithPhrase(username: string, recoveryWords: string[], newPassword?: string): Promise<UserProfileRemote> {
    const cleanUsername = username.trim().toLowerCase();

    // 1. Fetch Recovery Envelopes from Server Vault Proxy
    const recoveryRes = await fetch(getApiUrl("/api/vault/recovery"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: cleanUsername }),
    });

    if (!recoveryRes.ok) {
      throw new Error(`Recovery Error: Unable to locate account '${cleanUsername}'.`);
    }

    const { opaqueUserId, saltHex, recoveryWrappedDek, wrappedDek } = await recoveryRes.json();

    if (!recoveryWrappedDek) {
      throw new Error("Recovery Error: No 24-word recovery envelope exists for this profile.");
    }

    // 2. Unlock DEK locally in client memory using 24-Word BIP-39 Phrase
    const dek = await KeyManager.unlockWithRecoveryWords(recoveryWords, saltHex, recoveryWrappedDek);

    // 3. If new password provided, re-wrap DEK and re-register on server
    let updatedWrappedDek = wrappedDek;
    let updatedAuthProofHash = "";

    if (newPassword && newPassword.length >= 6) {
      const kek = await CryptoManager.deriveKEK(newPassword, CryptoManager.hexToBytes(saltHex));
      updatedWrappedDek = await CryptoManager.wrapDEK(dek, kek);
      updatedAuthProofHash = await CryptoManager.deriveAuthProofHash(newPassword, saltHex);

      const regRes = await fetch(getApiUrl("/api/vault/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: cleanUsername,
          opaqueUserId,
          saltHex,
          authProofHash: updatedAuthProofHash,
          wrappedDek: updatedWrappedDek,
          recoveryWrappedDek,
        }),
      });

      if (regRes.ok) {
        const regData = await regRes.json();
        this.sessionToken = regData.sessionToken;
      }
    }

    const profile: UserProfileRemote = {
      userId: opaqueUserId,
      username: cleanUsername,
      saltHex,
      authProofHash: updatedAuthProofHash,
      wrappedDek: updatedWrappedDek,
      recoveryWrappedDek,
      recoveryWordsCount: 24,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      schemaVersion: 1,
    };

    // 4. Unlock Session
    this.keyManager.setActiveSession(opaqueUserId, dek);
    this.currentUserProfile = profile;

    return profile;
  }

  // Logout - Complete Security Purge
  public async logout(): Promise<void> {
    // 1. Revoke Server Session if active
    if (this.sessionToken) {
      await fetch(getApiUrl("/api/vault/logout"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.sessionToken}`,
        },
      }).catch(() => {});
    }

    // 2. Zero / Destroy Memory Keys & Sessions
    this.keyManager.lockSession();
    this.currentUserProfile = null;
    this.sessionToken = null;

    // 3. Clear all cached IndexedDB records and queues
    await this.localDb.clearAllLocalData().catch(() => {});

    // 4. Clear browser sessionStorage & localStorage keys
    try {
      sessionStorage.clear();
      localStorage.removeItem("github_vault_session");
      localStorage.removeItem("github_vault_user");
    } catch {}
  }

  // Delete User Account
  public async deleteAccount(): Promise<boolean> {
    if (!this.sessionToken) throw new Error("Unauthorized: Active session required to delete account.");

    const res = await fetch(getApiUrl("/api/vault/account"), {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${this.sessionToken}`,
      },
    });

    if (!res.ok) {
      throw new Error("Failed to delete remote user vault.");
    }

    await this.logout();
    return true;
  }
}
