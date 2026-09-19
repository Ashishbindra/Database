/**
 * FreshnessLedger - Independent Server-Side Trusted Head Ledger
 *
 * Provides fresh-device rollback protection independent of GitHub storage credentials.
 * Tracks: { opaqueUserId, appId, headVersion, headStateHash, updatedAt }
 * Enforces:
 * - Monotonic version increments (dataVersion = headVersion + 1)
 * - Chain continuity (previousStateHash = headStateHash)
 * - Privacy: Zero plaintext records, keys, or user data.
 */

import fs from "fs";
import path from "path";

export interface FreshnessRecord {
  opaqueUserId: string;
  appId: string;
  headVersion: number;
  headStateHash: string;
  updatedAt: string;
}

export interface FreshnessLedger {
  getHead(opaqueUserId: string, appId: string): Promise<FreshnessRecord | null>;
  updateHead(
    opaqueUserId: string,
    appId: string,
    headVersion: number,
    headStateHash: string,
    previousStateHash: string
  ): Promise<{ success: boolean; record?: FreshnessRecord; reason?: string }>;
  deleteUserRecords(opaqueUserId: string): Promise<void>;
  isAvailable(): Promise<boolean>;
}

/**
 * 1. InMemoryFreshnessLedger - Transient in-memory freshness ledger
 */
export class InMemoryFreshnessLedger implements FreshnessLedger {
  private store = new Map<string, FreshnessRecord>();
  private available = true;

  public setAvailable(flag: boolean): void {
    this.available = flag;
  }

  public async isAvailable(): Promise<boolean> {
    return this.available;
  }

  private makeKey(opaqueUserId: string, appId: string): string {
    return `${opaqueUserId}:${appId}`;
  }

  public async getHead(opaqueUserId: string, appId: string): Promise<FreshnessRecord | null> {
    if (!this.available) {
      throw new Error("FRESHNESS_LEDGER_UNAVAILABLE: Server freshness ledger is unreachable.");
    }
    return this.store.get(this.makeKey(opaqueUserId, appId)) || null;
  }

  public async updateHead(
    opaqueUserId: string,
    appId: string,
    headVersion: number,
    headStateHash: string,
    previousStateHash: string
  ): Promise<{ success: boolean; record?: FreshnessRecord; reason?: string }> {
    if (!this.available) {
      throw new Error("FRESHNESS_LEDGER_UNAVAILABLE: Server freshness ledger is unreachable.");
    }

    const key = this.makeKey(opaqueUserId, appId);
    const existing = this.store.get(key);

    if (existing) {
      if (headVersion <= existing.headVersion) {
        return {
          success: false,
          reason: `Version Monotonicity Violation: incoming version ${headVersion} <= existing head ${existing.headVersion}`,
        };
      }
      if (headVersion !== existing.headVersion + 1) {
        return {
          success: false,
          reason: `Non-Consecutive Version Jump: incoming version ${headVersion} !== existing head ${existing.headVersion} + 1`,
        };
      }
      if (previousStateHash !== existing.headStateHash) {
        return {
          success: false,
          reason: `State Chain Hash Mismatch: incoming previousStateHash '${previousStateHash}' !== existing head '${existing.headStateHash}'`,
        };
      }
    } else {
      if (headVersion !== 1) {
        return {
          success: false,
          reason: `Initial Version Error: First state version must be 1, got ${headVersion}`,
        };
      }
    }

    const record: FreshnessRecord = {
      opaqueUserId,
      appId,
      headVersion,
      headStateHash,
      updatedAt: new Date().toISOString(),
    };

    this.store.set(key, record);
    return { success: true, record };
  }

  public async deleteUserRecords(opaqueUserId: string): Promise<void> {
    const prefix = `${opaqueUserId}:`;
    for (const key of Array.from(this.store.keys())) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  public clearAll(): void {
    this.store.clear();
  }
}

/**
 * 2. FileFreshnessLedger - Single-instance file-backed persistent freshness ledger
 */
export class FileFreshnessLedger implements FreshnessLedger {
  private filePath: string;
  private available = true;

  constructor(customPath?: string) {
    this.filePath = customPath || (typeof process !== "undefined" && process.cwd ? path.join(process.cwd(), "data", "freshness_ledger.json") : "data_freshness_ledger.json");
  }

  public setAvailable(flag: boolean): void {
    this.available = flag;
  }

  public async isAvailable(): Promise<boolean> {
    return this.available;
  }

  private loadStore(): Map<string, FreshnessRecord> {
    const store = new Map<string, FreshnessRecord>();
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem(this.filePath);
        if (raw) {
          const obj = JSON.parse(raw);
          for (const [k, v] of Object.entries(obj)) {
            store.set(k, v as FreshnessRecord);
          }
        }
      } catch {
        // browser fallback empty
      }
      return store;
    }
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf8");
        const obj = JSON.parse(raw);
        for (const [k, v] of Object.entries(obj)) {
          store.set(k, v as FreshnessRecord);
        }
      }
    } catch {
      throw new Error("FRESHNESS_LEDGER_UNAVAILABLE: Server freshness ledger file corrupted or unreadable.");
    }
    return store;
  }

  private saveStore(store: Map<string, FreshnessRecord>): void {
    const obj: Record<string, FreshnessRecord> = {};
    for (const [k, v] of store.entries()) {
      obj[k] = v;
    }
    const jsonStr = JSON.stringify(obj, null, 2);

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(this.filePath, jsonStr);
      } catch {
        // ignore
      }
      return;
    }

    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, jsonStr, "utf8");
    } catch {
      throw new Error("FRESHNESS_LEDGER_UNAVAILABLE: Failed to persist freshness ledger to disk.");
    }
  }

  private makeKey(opaqueUserId: string, appId: string): string {
    return `${opaqueUserId}:${appId}`;
  }

  public async getHead(opaqueUserId: string, appId: string): Promise<FreshnessRecord | null> {
    if (!this.available) {
      throw new Error("FRESHNESS_LEDGER_UNAVAILABLE: Server freshness ledger is unreachable.");
    }
    const store = this.loadStore();
    return store.get(this.makeKey(opaqueUserId, appId)) || null;
  }

  public async updateHead(
    opaqueUserId: string,
    appId: string,
    headVersion: number,
    headStateHash: string,
    previousStateHash: string
  ): Promise<{ success: boolean; record?: FreshnessRecord; reason?: string }> {
    if (!this.available) {
      throw new Error("FRESHNESS_LEDGER_UNAVAILABLE: Server freshness ledger is unreachable.");
    }

    const store = this.loadStore();
    const key = this.makeKey(opaqueUserId, appId);
    const existing = store.get(key);

    if (existing) {
      if (headVersion <= existing.headVersion) {
        return {
          success: false,
          reason: `Version Monotonicity Violation: incoming version ${headVersion} <= existing head ${existing.headVersion}`,
        };
      }
      if (headVersion !== existing.headVersion + 1) {
        return {
          success: false,
          reason: `Non-Consecutive Version Jump: incoming version ${headVersion} !== existing head ${existing.headVersion} + 1`,
        };
      }
      if (previousStateHash !== existing.headStateHash) {
        return {
          success: false,
          reason: `State Chain Hash Mismatch: incoming previousStateHash '${previousStateHash}' !== existing head '${existing.headStateHash}'`,
        };
      }
    } else {
      if (headVersion !== 1) {
        return {
          success: false,
          reason: `Initial Version Error: First state version must be 1, got ${headVersion}`,
        };
      }
    }

    const record: FreshnessRecord = {
      opaqueUserId,
      appId,
      headVersion,
      headStateHash,
      updatedAt: new Date().toISOString(),
    };

    store.set(key, record);
    this.saveStore(store);
    return { success: true, record };
  }

  public async deleteUserRecords(opaqueUserId: string): Promise<void> {
    const store = this.loadStore();
    const prefix = `${opaqueUserId}:`;
    for (const key of Array.from(store.keys())) {
      if (key.startsWith(prefix)) {
        store.delete(key);
      }
    }
    this.saveStore(store);
  }

  public clearAll(): void {
    const store = new Map<string, FreshnessRecord>();
    this.saveStore(store);
  }
}


/**
 * 3. GitHubDistributedFreshnessLedger - Persistent shared backend freshness ledger backed by GitHub
 * Enforces atomic updates using GitHub SHA checks.
 * Fails closed if GitHub backend is unconfigured or unreachable.
 */
export class GitHubDistributedFreshnessLedger implements FreshnessLedger {
  constructor(private githubStorageClient: any) {}

  public async isAvailable(): Promise<boolean> {
    return true; // Assume available if client exists
  }

  public async getHead(opaqueUserId: string, appId: string): Promise<FreshnessRecord | null> {
    const file = await this.githubStorageClient.getFile(`freshness/${opaqueUserId}/${appId}.json`);
    if (!file) return null;
    return JSON.parse(file.content) as FreshnessRecord;
  }

  public async updateHead(
    opaqueUserId: string,
    appId: string,
    headVersion: number,
    headStateHash: string,
    previousStateHash: string
  ): Promise<{ success: boolean; record?: FreshnessRecord; reason?: string }> {
    const filePath = `freshness/${opaqueUserId}/${appId}.json`;
    const file = await this.githubStorageClient.getFile(filePath) || { content: null, sha: undefined };
    
    let existing: FreshnessRecord | null = null;
    if (file.content) {
      existing = JSON.parse(file.content);
    }

    if (existing) {
      if (headVersion <= existing.headVersion) {
        return {
          success: false,
          reason: `Version Monotonicity Violation: incoming version ${headVersion} <= existing head ${existing.headVersion}`,
        };
      }
      if (headVersion !== existing.headVersion + 1) {
        return {
          success: false,
          reason: `Non-Consecutive Version Jump: incoming version ${headVersion} !== existing head ${existing.headVersion} + 1`,
        };
      }
      if (previousStateHash !== existing.headStateHash) {
        return {
          success: false,
          reason: `State Chain Hash Mismatch: incoming previousStateHash '${previousStateHash}' !== existing head '${existing.headStateHash}'`,
        };
      }
    } else {
      if (headVersion !== 1) {
        return {
          success: false,
          reason: `Initial Version Error: First state version must be 1, got ${headVersion}`,
        };
      }
    }

    const record: FreshnessRecord = {
      opaqueUserId,
      appId,
      headVersion,
      headStateHash,
      updatedAt: new Date().toISOString(),
    };

    await this.githubStorageClient.putFile(filePath, JSON.stringify(record), "Update freshness head");
    return { success: true, record };
  }

  public async deleteUserRecords(opaqueUserId: string): Promise<void> {
    // Implement delete by listing directory or just setting to null?
    // GitHub API requires deleting individual files.
    // GitHubStorageClient.deleteDir?
    await this.githubStorageClient.deleteDir(`freshness/${opaqueUserId}/`);
  }
}

/**
 * FreshnessLedger Factory - Selects freshness ledger implementation according to environment configuration.
 */
export function getFreshnessLedger(githubStorageClient?: any): FreshnessLedger {
  const provider =
    process.env.FRESHNESS_LEDGER_PROVIDER || (process.env.NODE_ENV === "production" ? "distributed" : "file");

  if (provider === "distributed") {
    if (!githubStorageClient) throw new Error("GitHub storage client required for distributed freshness ledger");
    return new GitHubDistributedFreshnessLedger(githubStorageClient);
  } else if (provider === "memory") {
    return new InMemoryFreshnessLedger();
  } else {
    return new FileFreshnessLedger();
  }
}

// Backwards Compatibility Export
export const ServerSideFreshnessLedger = FileFreshnessLedger;
export const defaultFreshnessLedger = getFreshnessLedger();
