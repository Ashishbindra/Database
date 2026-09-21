/**
 * CentralDataClient - Unified Gateway for Multi-Application Encrypted Storage SDK
 * Bridges AuthManager, KeyManager, IndexedDBStorage, GitHubStorageClient, and SyncManager.
 */

import { AppRegistry } from "./apps/AppRegistry";
import { AuthManager } from "./auth/AuthManager";
import { CryptoManager } from "./crypto/CryptoManager";
import { KeyManager } from "./crypto/KeyManager";
import { GitHubStorageClient } from "./storage/GitHubStorageClient";
import { IndexedDBStorage } from "./storage/IndexedDBStorage";
import { SyncManager } from "./sync/SyncManager";
import { GitHubConfig, SyncRecord } from "./types";
import { EncryptedVaultSDK } from "./storage/EncryptedVaultSDK";

export class CentralDataClient {
  public keyManager: KeyManager;
  public localDb: IndexedDBStorage;
  public githubClient: GitHubStorageClient;
  public authManager: AuthManager;
  public syncManager: SyncManager;
  public vault: EncryptedVaultSDK;

  private isInitialized = false;

  constructor(initialGithubConfig?: Partial<GitHubConfig>) {
    const defaultConfig: GitHubConfig = {
      mode: "SERVER",
      owner: "demo-org",
      repo: "encrypted-vault-storage",
      branch: "main",
      pat: "",
      ...initialGithubConfig,
    };

    this.keyManager = new KeyManager();
    this.localDb = new IndexedDBStorage();
    this.githubClient = new GitHubStorageClient(defaultConfig);
    this.authManager = new AuthManager(this.keyManager, this.localDb);
    this.syncManager = new SyncManager(this.localDb, this.githubClient, this.keyManager);

    // Provide Session Supplier to GitHub Client
    this.githubClient.setSessionTokenSupplier(() => this.authManager.getSessionToken());

    this.vault = new EncryptedVaultSDK(this);
  }

  public async init(): Promise<void> {
    if (this.isInitialized) return;
    await this.localDb.init();
    try {
      await this.authManager.restoreSessionFromCache();
    } catch (err) {
      console.error("Session restoration failed during SDK init:", err);
    }
    this.isInitialized = true;
  }

  // --- APPLICATION RECORD MANAGEMENT ---

  public async saveAppRecord<T = any>(appId: string, entity: string, data: T & { id?: string }): Promise<SyncRecord> {
    AppRegistry.getApp(appId); // Validate Registered App ID
    if (!this.authManager.isLoggedIn()) {
      throw new Error("SDK Error: Active user session required to save application records.");
    }

    const userId = this.keyManager.getActiveUserId();
    const randomHex = CryptoManager.bytesToHex(CryptoManager.getRandomBytes(6));
    const id = data.id || `rec_${Date.now()}_${randomHex}`;

    const existing = await this.localDb.getRecord(appId, userId, entity, id);
    const version = existing ? existing.version + 1 : 1;

    const syncRecord: SyncRecord = {
      id,
      appId,
      userId,
      entity,
      data,
      version,
      isDeleted: false,
      updatedAt: new Date().toISOString(),
      status: "PENDING",
    };

    // Save to local IndexedDB working cache
    await this.localDb.saveRecord(syncRecord);

    // Queue for sync
    await this.localDb.addToSyncQueue(syncRecord);

    return syncRecord;
  }

  public async getAppRecords<T = any>(appId: string, entity: string): Promise<T[]> {
    AppRegistry.getApp(appId);
    if (!this.authManager.isLoggedIn()) {
      return [];
    }

    const userId = this.keyManager.getActiveUserId();
    const records = await this.localDb.getRecordsForEntity(appId, userId, entity);
    return records.map((r) => r.data as T);
  }

  public async deleteAppRecord(appId: string, entity: string, recordId: string): Promise<void> {
    AppRegistry.getApp(appId);
    if (!this.authManager.isLoggedIn()) return;

    const userId = this.keyManager.getActiveUserId();
    const existing = await this.localDb.getRecord(appId, userId, entity, recordId);

    if (existing) {
      const tombstoneRecord: SyncRecord = {
        ...existing,
        isDeleted: true,
        version: existing.version + 1,
        updatedAt: new Date().toISOString(),
        status: "PENDING",
      };

      await this.localDb.saveRecord(tombstoneRecord);
      await this.localDb.addToSyncQueue(tombstoneRecord);
    }
  }

  // --- SYNC & RESTORE ---

  public async syncApp(appId: string) {
    return await this.syncManager.syncApp(appId);
  }

  public async restoreFromCloud(appId: string) {
    return await this.syncManager.restoreFromCloud(appId);
  }

  // --- BACKUP & EXPORT ---

  public async exportEncryptedBackup(): Promise<string> {
    if (!this.authManager.isLoggedIn()) {
      throw new Error("Backup Error: Active session required.");
    }

    const userId = this.keyManager.getActiveUserId();
    const dek = this.keyManager.getActiveDek();

    const allRecords: SyncRecord[] = [];
    const apps = AppRegistry.getAllApps();

    for (const app of apps) {
      const recs = await this.localDb.getAllRecordsForApp(app.appId, userId);
      allRecords.push(...recs);
    }

    const encryptedEnvelope = await CryptoManager.encryptData(
      allRecords,
      dek,
      "central_backup",
      userId,
      1,
      Date.now()
    );

    return JSON.stringify(encryptedEnvelope, null, 2);
  }

  public async importEncryptedBackup(jsonBackup: string): Promise<number> {
    if (!this.authManager.isLoggedIn()) {
      throw new Error("Backup Import Error: Active session required.");
    }

    const userId = this.keyManager.getActiveUserId();
    const dek = this.keyManager.getActiveDek();

    const envelope = JSON.parse(jsonBackup);
    const decrypted = await CryptoManager.decryptData<SyncRecord[]>(
      envelope,
      dek,
      "central_backup",
      userId
    );

    let importedCount = 0;
    if (Array.isArray(decrypted.payload)) {
      for (const rec of decrypted.payload) {
        await this.localDb.saveRecord({
          ...rec,
          status: "PENDING",
        });
        await this.localDb.addToSyncQueue(rec);
        importedCount++;
      }
    }

    return importedCount;
  }

  // --- ACCOUNT DELETION ---

  public async deleteAccountData(): Promise<void> {
    if (!this.authManager.isLoggedIn()) return;
    await this.authManager.deleteAccount();
  }

  // --- WORKER AUTHENTICATION ---

  public async getWorkerAuthParams(workerId: string) {
    return await this.githubClient.getWorkerAuthParams(workerId);
  }

  public async workerLogin(workerId: string, password: string) {
    const authParams = await this.getWorkerAuthParams(workerId);
    if (!authParams.exists || !authParams.isWorkerLoginEnabled || !authParams.workerSaltHex) {
      throw new Error("Worker login is not enabled for this ID.");
    }
    const saltHex = authParams.workerSaltHex;
    const passwordHash = await CryptoManager.deriveAuthProofHash(password, saltHex);
    return await this.githubClient.workerLogin(workerId, passwordHash);
  }

  public async workerLoginAndGetState(workerId: string, password: string, appId: string = "shramik_hisab") {
    const authParams = await this.getWorkerAuthParams(workerId);
    if (!authParams.exists || !authParams.isWorkerLoginEnabled || !authParams.workerSaltHex) {
      throw new Error("Worker login is not enabled for this ID.");
    }
    const saltHex = authParams.workerSaltHex;
    const passwordHash = await CryptoManager.deriveAuthProofHash(password, saltHex);

    const loginResult = await this.githubClient.workerLogin(workerId, passwordHash);
    if (!loginResult.success) {
      throw new Error("Worker authentication failed.");
    }

    const stateResult = await (this.githubClient as any).workerGetState(workerId, passwordHash, appId);

    return {
      session: loginResult,
      state: stateResult.state || null,
      opaqueUserId: loginResult.opaqueUserId
    };
  }
}
