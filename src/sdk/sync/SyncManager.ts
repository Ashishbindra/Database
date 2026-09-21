/**
 * SyncManager - Offline-First Synchronization & Cryptographic Transfer Engine
 * Handles:
 * - Encrypting local records before sending to GitHub
 * - Downloading and decrypting GitHub remote payloads
 * - Offline Queue Flushing
 * - Uninstall / Reinstall Cloud State Restoration
 */

import { CryptoManager } from "../crypto/CryptoManager";
import { KeyManager } from "../crypto/KeyManager";
import { GitHubStorageClient } from "../storage/GitHubStorageClient";
import { IndexedDBStorage } from "../storage/IndexedDBStorage";
import { EncryptedFileEnvelope, SyncRecord } from "../types";
import { ConflictManager } from "./ConflictManager";

export class SyncManager {
  private localDb: IndexedDBStorage;
  private githubClient: GitHubStorageClient;
  private keyManager: KeyManager;

  constructor(localDb: IndexedDBStorage, githubClient: GitHubStorageClient, keyManager: KeyManager) {
    this.localDb = localDb;
    this.githubClient = githubClient;
    this.keyManager = keyManager;
  }

  // Push pending offline queue and sync active app dataset
  public async syncApp(appId: string): Promise<{
    pushedCount: number;
    pulledCount: number;
    conflictsResolved: number;
  }> {
    if (!this.keyManager.isUnlocked()) {
      throw new Error("Sync Error: Encryption key locked. Please login.");
    }

    const userId = this.keyManager.getActiveUserId();
    const dek = this.keyManager.getActiveDek();

    let pushedCount = 0;
    let pulledCount = 0;
    let conflictsResolved = 0;

    // 1. Fetch pending sync items from local IndexedDB
    const pendingItems = await this.localDb.getPendingSyncQueue(appId, userId);

    // 2. Load current local state for this app
    const localRecords = await this.localDb.getAllRecordsForApp(appId, userId);
    const localMap = new Map<string, SyncRecord>();
    localRecords.forEach((r) => localMap.set(r.id, r));

    // 3. Remote Path for Encrypted App Bundle on GitHub
    // Format: data/users/<userId>/<appId>/encrypted_bundle.json
    const remotePath = `data/users/${userId}/${appId}/encrypted_bundle.json`;

    // 4. Fetch Remote Encrypted Bundle from GitHub
    const remoteFileRes = await this.githubClient.getFile(remotePath);
    let remoteRecordsMap = new Map<string, SyncRecord>();
    let existingRemoteSha: string | undefined = undefined;

    if (remoteFileRes) {
      existingRemoteSha = remoteFileRes.sha;
      try {
        const envelope: EncryptedFileEnvelope = JSON.parse(remoteFileRes.content);

        // Decrypt Remote Bundle using DEK with App & User Isolation verification!
        const decryptedBundle = await CryptoManager.decryptData<Record<string, SyncRecord>>(
          envelope,
          dek,
          appId,
          userId
        );

        if (decryptedBundle.payload) {
          Object.entries(decryptedBundle.payload).forEach(([id, rec]) => {
            remoteRecordsMap.set(id, rec);
          });
        }
      } catch (err: any) {
        console.warn(`Sync Warning: Could not decrypt remote bundle for ${appId}:`, err.message);
      }
    }

    // 5. Merge Local & Remote Records with Conflict Resolution
    const mergedMap = new Map<string, SyncRecord>(remoteRecordsMap);

    // Process all local records
    for (const [id, localRec] of localMap.entries()) {
      const remoteRec = remoteRecordsMap.get(id);
      if (!remoteRec) {
        mergedMap.set(id, localRec);
      } else {
        const res = ConflictManager.resolveConflict(localRec, remoteRec);
        mergedMap.set(id, res.resolvedRecord);
        if (res.wasConflict) conflictsResolved++;
      }
    }

    // Save merged result back to local IndexedDB
    for (const rec of mergedMap.values()) {
      await this.localDb.saveRecord({ ...rec, status: "SYNCED", syncedAt: new Date().toISOString() });
      pulledCount++;
    }

    // Clear pending sync queue items
    for (const item of pendingItems) {
      await this.localDb.removeFromSyncQueue(item.id);
      pushedCount++;
    }

    // 6. Encrypt updated merged state into EncryptedFileEnvelope
    const recordsToEncrypt: Record<string, SyncRecord> = {};
    for (const [id, rec] of mergedMap.entries()) {
      recordsToEncrypt[id] = rec;
    }

    const encryptedEnvelope = await CryptoManager.encryptData(
      recordsToEncrypt,
      dek,
      appId,
      userId,
      1, // Schema version
      Date.now() // Data version
    );

    // 7. Push Encrypted Envelope to Server Vault Sync API with workerAuthEntries
    let workerAuthEntries: any[] | undefined = undefined;
    if (appId === "shramik_hisab") {
      workerAuthEntries = [];
      for (const rec of mergedMap.values()) {
        if (rec.entity === "workers" && !rec.isDeleted && rec.data) {
          const w = rec.data as any;
          if (w.isWorkerLoginEnabled && w.workerPasswordHash && w.workerSaltHex) {
            workerAuthEntries.push({
              workerId: w.id || w.workerId,
              isWorkerLoginEnabled: true,
              workerPasswordHash: w.workerPasswordHash,
              workerSaltHex: w.workerSaltHex,
            });
          } else if (w.id) {
            workerAuthEntries.push({
              workerId: w.id,
              isWorkerLoginEnabled: false,
            });
          }
        }
      }
    }

    await this.githubClient.syncState(appId, encryptedEnvelope, workerAuthEntries);

    return { pushedCount, pulledCount, conflictsResolved };
  }

  // Restore Remote Cloud State (Uninstall / Reinstall Recovery & New Device Sync)
  public async restoreFromCloud(appId: string): Promise<number> {
    if (!this.keyManager.isUnlocked()) {
      throw new Error("Restore Error: Session locked.");
    }

    const userId = this.keyManager.getActiveUserId();
    const dek = this.keyManager.getActiveDek();

    const remotePath = `data/users/${userId}/${appId}/encrypted_bundle.json`;
    const remoteFileRes = await this.githubClient.getFile(remotePath);

    if (!remoteFileRes) {
      return 0;
    }

    const envelope: EncryptedFileEnvelope = JSON.parse(remoteFileRes.content);

    // Decrypt Remote Bundle using DEK
    const decryptedBundle = await CryptoManager.decryptData<Record<string, SyncRecord>>(
      envelope,
      dek,
      appId,
      userId
    );

    let restoredCount = 0;
    if (decryptedBundle.payload) {
      for (const rec of Object.values(decryptedBundle.payload)) {
        await this.localDb.saveRecord({
          ...rec,
          status: "SYNCED",
          syncedAt: new Date().toISOString(),
        });
        restoredCount++;
      }
    }

    return restoredCount;
  }
}
