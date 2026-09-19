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
import pg from "pg";

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
 * 3. DatabaseDistributedFreshnessLedger - Production shared backend freshness ledger (PostgreSQL)
 * Enforces atomic transactions and unique constraint on (opaqueUserId, appId).
 * Fails closed if database backend is unconfigured or unreachable.
 */
export class DatabaseDistributedFreshnessLedger implements FreshnessLedger {
  private pgPool: pg.Pool | null = null;
  private dbInitialized = false;
  private available = true;

  constructor(private dbUrlOrPool?: string | pg.Pool) {
    if (typeof dbUrlOrPool === "object" && dbUrlOrPool !== null) {
      this.pgPool = dbUrlOrPool as pg.Pool;
    } else {
      const url = (typeof dbUrlOrPool === "string" ? dbUrlOrPool : undefined) || process.env.DATABASE_URL;
      if (url && (url.startsWith("postgres://") || url.startsWith("postgresql://"))) {
        this.pgPool = new pg.Pool({ connectionString: url, max: 10 });
      }
    }
  }

  public setAvailable(flag: boolean): void {
    this.available = flag;
  }

  public async isAvailable(): Promise<boolean> {
    if (!this.available) return false;
    try {
      const pool = await this.ensurePgTable();
      await pool.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  }

  private async ensurePgTable(): Promise<pg.Pool> {
    if (!this.available) {
      throw new Error("FRESHNESS_LEDGER_UNAVAILABLE: Server freshness ledger is unreachable.");
    }
    if (!this.pgPool) {
      throw new Error(
        "FRESHNESS_LEDGER_UNAVAILABLE: DATABASE_URL environment variable is required for distributed freshness ledger."
      );
    }
    if (!this.dbInitialized) {
      try {
        await this.pgPool.query(`
          CREATE TABLE IF NOT EXISTS freshness_heads (
            opaque_user_id text,
            app_id text,
            head_version int,
            head_state_hash text,
            updated_at text,
            primary key (opaque_user_id, app_id)
          )
        `);
        this.dbInitialized = true;
      } catch (err) {
        throw new Error(
          `FRESHNESS_LEDGER_UNAVAILABLE: Failed to initialize PostgreSQL freshness tables: ${(err as Error).message}`
        );
      }
    }
    return this.pgPool;
  }

  public async getHead(opaqueUserId: string, appId: string): Promise<FreshnessRecord | null> {
    const pool = await this.ensurePgTable();
    try {
      const res = await pool.query(
        "SELECT opaque_user_id, app_id, head_version, head_state_hash, updated_at FROM freshness_heads WHERE opaque_user_id = $1 AND app_id = $2",
        [opaqueUserId, appId]
      );
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      return {
        opaqueUserId: row.opaque_user_id,
        appId: row.app_id,
        headVersion: row.head_version,
        headStateHash: row.head_state_hash,
        updatedAt: new Date(row.updated_at).toISOString(),
      };
    } catch (err) {
      throw new Error(`FRESHNESS_LEDGER_UNAVAILABLE: Database query failed: ${(err as Error).message}`);
    }
  }

  public async updateHead(
    opaqueUserId: string,
    appId: string,
    headVersion: number,
    headStateHash: string,
    previousStateHash: string
  ): Promise<{ success: boolean; record?: FreshnessRecord; reason?: string }> {
    const pool = await this.ensurePgTable();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const selectRes = await client.query(
        "SELECT head_version, head_state_hash FROM freshness_heads WHERE opaque_user_id = $1 AND app_id = $2 FOR UPDATE",
        [opaqueUserId, appId]
      );

      if (selectRes.rows.length > 0) {
        const existing = selectRes.rows[0];
        const existingVersion = Number(existing.head_version);
        const existingHash = existing.head_state_hash;

        if (headVersion <= existingVersion) {
          await client.query("ROLLBACK");
          return {
            success: false,
            reason: `Version Monotonicity Violation: incoming version ${headVersion} <= existing head ${existingVersion}`,
          };
        }
        if (headVersion !== existingVersion + 1) {
          await client.query("ROLLBACK");
          return {
            success: false,
            reason: `Non-Consecutive Version Jump: incoming version ${headVersion} !== existing head ${existingVersion} + 1`,
          };
        }
        if (previousStateHash !== existingHash) {
          await client.query("ROLLBACK");
          return {
            success: false,
            reason: `State Chain Hash Mismatch: incoming previousStateHash '${previousStateHash}' !== existing head '${existingHash}'`,
          };
        }

        await client.query(
          "UPDATE freshness_heads SET head_version = $3, head_state_hash = $4, updated_at = CURRENT_TIMESTAMP WHERE opaque_user_id = $1 AND app_id = $2",
          [opaqueUserId, appId, headVersion, headStateHash]
        );
      } else {
        if (headVersion !== 1) {
          await client.query("ROLLBACK");
          return {
            success: false,
            reason: `Initial Version Error: First state version must be 1, got ${headVersion}`,
          };
        }

        await client.query(
          "INSERT INTO freshness_heads (opaque_user_id, app_id, head_version, head_state_hash, updated_at) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)",
          [opaqueUserId, appId, headVersion, headStateHash]
        );
      }

      await client.query("COMMIT");

      const record: FreshnessRecord = {
        opaqueUserId,
        appId,
        headVersion,
        headStateHash,
        updatedAt: new Date().toISOString(),
      };
      return { success: true, record };
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`FRESHNESS_LEDGER_UNAVAILABLE: Atomic head update failed: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }

  public async deleteUserRecords(opaqueUserId: string): Promise<void> {
    const pool = await this.ensurePgTable();
    try {
      await pool.query("DELETE FROM freshness_heads WHERE opaque_user_id = $1", [opaqueUserId]);
    } catch (err) {
      throw new Error(`FRESHNESS_LEDGER_UNAVAILABLE: Delete user records failed: ${(err as Error).message}`);
    }
  }
}

/**
 * FreshnessLedger Factory - Selects freshness ledger implementation according to environment configuration.
 * Never silently degrades to memory/file if "distributed" is specified or required in production.
 */
export function getFreshnessLedger(): FreshnessLedger {
  const provider =
    process.env.FRESHNESS_LEDGER_PROVIDER || (process.env.NODE_ENV === "production" ? "distributed" : "file");

  if (provider === "distributed") {
    return new DatabaseDistributedFreshnessLedger();
  } else if (provider === "memory") {
    return new InMemoryFreshnessLedger();
  } else {
    return new FileFreshnessLedger();
  }
}

// Backwards Compatibility Export
export const ServerSideFreshnessLedger = FileFreshnessLedger;
export const defaultFreshnessLedger = getFreshnessLedger();
