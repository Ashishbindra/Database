/**
 * IndexedDBStorage - Local Offline-First Working Database
 * Stores local application records and offline sync queues.
 * Does NOT rely on fragile localStorage for structured app data.
 */

import { SyncRecord } from "../types";

export class IndexedDBStorage {
  private dbName = "GithubEncryptedSDK_LocalDB";
  private dbVersion = 1;
  private db: IDBDatabase | null = null;

  // In-memory fallback for Node.js / SSR execution environments where indexedDB is not available
  private memoryRecords = new Map<string, SyncRecord>();
  private memorySyncQueue = new Map<string, SyncRecord>();
  private memoryUserCache = new Map<string, any>();
  private isMemoryMode = false;

  public async init(): Promise<void> {
    if (this.db || this.isMemoryMode) return;

    if (typeof indexedDB === "undefined") {
      this.isMemoryMode = true;
      return;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (event: any) => {
        const db = event.target.result as IDBDatabase;

        // Store 1: Local Application Records
        if (!db.objectStoreNames.contains("records")) {
          const recordsStore = db.createObjectStore("records", { keyPath: "compositeKey" });
          recordsStore.createIndex("appId_userId", ["appId", "userId"], { unique: false });
          recordsStore.createIndex("appId_userId_entity", ["appId", "userId", "entity"], { unique: false });
        }

        // Store 2: Offline Sync Queue
        if (!db.objectStoreNames.contains("sync_queue")) {
          const syncStore = db.createObjectStore("sync_queue", { keyPath: "id" });
          syncStore.createIndex("appId_userId", ["appId", "userId"], { unique: false });
          syncStore.createIndex("status", "status", { unique: false });
        }

        // Store 3: Local Cached Metadata / User Profiles
        if (!db.objectStoreNames.contains("user_cache")) {
          db.createObjectStore("user_cache", { keyPath: "userId" });
        }
      };

      request.onsuccess = (event: any) => {
        this.db = event.target.result;
        resolve();
      };

      request.onerror = (event: any) => {
        reject(new Error(`IndexedDB Init Error: ${event.target.error}`));
      };
    });
  }

  private getDB(): IDBDatabase {
    if (!this.db) {
      throw new Error("IndexedDB not initialized. Call init() first.");
    }
    return this.db;
  }

  // --- RECORD OPERATIONS ---

  public async saveRecord(record: SyncRecord): Promise<void> {
    const compositeKey = `${record.appId}:${record.userId}:${record.entity}:${record.id}`;
    if (this.isMemoryMode) {
      this.memoryRecords.set(compositeKey, { ...record });
      return;
    }

    const db = this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["records"], "readwrite");
      const store = tx.objectStore("records");
      const req = store.put({ ...record, compositeKey });

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  public async getRecord(appId: string, userId: string, entity: string, recordId: string): Promise<SyncRecord | null> {
    const compositeKey = `${appId}:${userId}:${entity}:${recordId}`;
    if (this.isMemoryMode) {
      return this.memoryRecords.get(compositeKey) || null;
    }

    const db = this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["records"], "readonly");
      const store = tx.objectStore("records");
      const req = store.get(compositeKey);

      req.onsuccess = () => resolve(req.result ? req.result : null);
      req.onerror = () => reject(req.error);
    });
  }

  public async getRecordsForEntity(appId: string, userId: string, entity: string): Promise<SyncRecord[]> {
    if (this.isMemoryMode) {
      const results: SyncRecord[] = [];
      for (const r of this.memoryRecords.values()) {
        if (r.appId === appId && r.userId === userId && r.entity === entity && !r.isDeleted) {
          results.push({ ...r });
        }
      }
      return results;
    }

    const db = this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["records"], "readonly");
      const store = tx.objectStore("records");
      const index = store.index("appId_userId_entity");
      const req = index.getAll([appId, userId, entity]);

      req.onsuccess = () => {
        const results: SyncRecord[] = req.result || [];
        // Filter out deleted items for normal query
        resolve(results.filter((r) => !r.isDeleted));
      };
      req.onerror = () => reject(req.error);
    });
  }

  public async getAllRecordsForApp(appId: string, userId: string): Promise<SyncRecord[]> {
    if (this.isMemoryMode) {
      const results: SyncRecord[] = [];
      for (const r of this.memoryRecords.values()) {
        if (r.appId === appId && r.userId === userId) {
          results.push({ ...r });
        }
      }
      return results;
    }

    const db = this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["records"], "readonly");
      const store = tx.objectStore("records");
      const index = store.index("appId_userId");
      const req = index.getAll([appId, userId]);

      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  public async clearAllLocalData(): Promise<void> {
    if (this.isMemoryMode) {
      this.memoryRecords.clear();
      this.memorySyncQueue.clear();
      this.memoryUserCache.clear();
      return;
    }

    const db = this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["records", "sync_queue", "user_cache"], "readwrite");
      tx.objectStore("records").clear();
      tx.objectStore("sync_queue").clear();
      tx.objectStore("user_cache").clear();

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- SYNC QUEUE OPERATIONS ---

  public async addToSyncQueue(record: SyncRecord): Promise<void> {
    if (this.isMemoryMode) {
      this.memorySyncQueue.set(record.id, { ...record });
      return;
    }

    const db = this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["sync_queue"], "readwrite");
      const store = tx.objectStore("sync_queue");
      const req = store.put(record);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  public async getPendingSyncQueue(appId: string, userId: string): Promise<SyncRecord[]> {
    if (this.isMemoryMode) {
      const queue: SyncRecord[] = [];
      for (const q of this.memorySyncQueue.values()) {
        if (q.appId === appId && q.userId === userId && (q.status === "PENDING" || q.status === "ERROR")) {
          queue.push({ ...q });
        }
      }
      return queue;
    }

    const db = this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["sync_queue"], "readonly");
      const store = tx.objectStore("sync_queue");
      const index = store.index("appId_userId");
      const req = index.getAll([appId, userId]);

      req.onsuccess = () => {
        const queue: SyncRecord[] = req.result || [];
        resolve(queue.filter((q) => q.status === "PENDING" || q.status === "ERROR"));
      };
      req.onerror = () => reject(req.error);
    });
  }

  public async removeFromSyncQueue(id: string): Promise<void> {
    if (this.isMemoryMode) {
      this.memorySyncQueue.delete(id);
      return;
    }

    const db = this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["sync_queue"], "readwrite");
      const store = tx.objectStore("sync_queue");
      const req = store.delete(id);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}
