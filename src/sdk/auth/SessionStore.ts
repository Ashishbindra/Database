import crypto from "crypto";
import fs from "fs";
import path from "path";
import pg from "pg";

// Helper to convert string to base64url safely without Node Buffer
function stringToBase64Url(str: string): string {
  const gBuf = typeof globalThis !== "undefined" ? (globalThis as any).Buffer : undefined;
  if (gBuf) {
    return gBuf.from(str).toString("base64url");
  }
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Helper to convert base64url string back to UTF-8 string without Node Buffer
function base64UrlToString(base64url: string): string {
  const gBuf = typeof globalThis !== "undefined" ? (globalThis as any).Buffer : undefined;
  if (gBuf) {
    return gBuf.from(base64url, "base64url").toString("utf8");
  }
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

// Helper for random bytes hex string
function generateRandomHex(byteCount = 16): string {
  if (typeof window !== "undefined" && window.crypto && window.crypto.getRandomValues) {
    const arr = new Uint8Array(byteCount);
    window.crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
  }
  if (crypto && typeof crypto.randomBytes === "function") {
    return crypto.randomBytes(byteCount).toString("hex");
  }
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Helper for HMAC hex computation
function generateHmacHex(secret: string, data: string): string {
  if (crypto && typeof crypto.createHmac === "function") {
    try {
      return crypto.createHmac("sha256", secret).update(data).digest("hex");
    } catch {
      // fallback
    }
  }
  // Simple JS hash fallback for browser test context
  let hash = 0;
  const combined = secret + ":" + data;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

// Helper for constant-time string comparison
export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export interface Session {
  sessionId: string;
  opaqueUserId: string;
  issuedAt: number;
  expiresAt: number;
}

export interface SessionStore {
  createSession(opaqueUserId: string): Promise<{ token: string; session: Session }>;
  validateSession(token: string): Promise<Session | null>;
  revokeSession(sessionId: string): Promise<void>;
  revokeAllForUser(opaqueUserId: string): Promise<void>;
  isRevoked(sessionId: string): Promise<boolean>;
  cleanupExpiredSessions?(): Promise<number>;
}

const SESSION_SECRET = (typeof process !== "undefined" && process.env && process.env.SESSION_SECRET) || "default_session_secret_change_in_prod";

/**
 * 1. InMemorySessionStore - Fast in-memory session store for ephemeral dev/testing
 */
export class InMemorySessionStore implements SessionStore {
  private activeSessions = new Map<string, Session>();
  private revokedSessionIds = new Set<string>();

  public async createSession(opaqueUserId: string): Promise<{ token: string; session: Session }> {
    const sessionId = generateRandomHex(16);
    const issuedAt = Date.now();
    const expiresAt = issuedAt + 24 * 60 * 60 * 1000;

    const session: Session = { sessionId, opaqueUserId, issuedAt, expiresAt };
    const payload = JSON.stringify(session);
    const hmac = generateHmacHex(SESSION_SECRET, payload);
    const token = stringToBase64Url(payload) + "." + hmac;

    this.activeSessions.set(sessionId, session);
    return { token, session };
  }

  public async validateSession(token: string): Promise<Session | null> {
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;

    try {
      const payloadStr = base64UrlToString(parts[0]);
      const expectedHmac = generateHmacHex(SESSION_SECRET, payloadStr);

      if (!safeCompare(parts[1], expectedHmac)) {
        return null;
      }

      const payload: Session = JSON.parse(payloadStr);

      if (Date.now() > payload.expiresAt) return null;
      if (this.revokedSessionIds.has(payload.sessionId)) return null;

      return payload;
    } catch {
      return null;
    }
  }

  public async revokeSession(sessionId: string): Promise<void> {
    this.revokedSessionIds.add(sessionId);
    this.activeSessions.delete(sessionId);
  }

  public async isRevoked(sessionId: string): Promise<boolean> {
    return this.revokedSessionIds.has(sessionId);
  }

  public async revokeAllForUser(opaqueUserId: string): Promise<void> {
    for (const [sId, sess] of this.activeSessions.entries()) {
      if (sess.opaqueUserId === opaqueUserId) {
        this.revokedSessionIds.add(sId);
        this.activeSessions.delete(sId);
      }
    }
  }

  public async cleanupExpiredSessions(): Promise<number> {
    const now = Date.now();
    let cleaned = 0;
    for (const [sId, sess] of this.activeSessions.entries()) {
      if (now > sess.expiresAt) {
        this.activeSessions.delete(sId);
        cleaned++;
      }
    }
    return cleaned;
  }
}

/**
 * 2. FileSessionStore - Persistent single-instance session store backed by local JSON file
 */
interface SessionDataFile {
  sessions: Record<string, Session>;
  revokedIds: string[];
}

export class FileSessionStore implements SessionStore {
  private filePath: string;

  constructor(customPath?: string) {
    this.filePath = customPath || (typeof process !== "undefined" && process.cwd ? path.join(process.cwd(), "data", "sessions.json") : "data_sessions.json");
  }

  private loadStore(): SessionDataFile {
    if (typeof window !== "undefined") {
      try {
        const item = localStorage.getItem(this.filePath);
        if (item) return JSON.parse(item);
        const initial: SessionDataFile = { sessions: {}, revokedIds: [] };
        localStorage.setItem(this.filePath, JSON.stringify(initial));
        return initial;
      } catch {
        return { sessions: {}, revokedIds: [] };
      }
    }
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (!fs.existsSync(this.filePath)) {
        const initial: SessionDataFile = { sessions: {}, revokedIds: [] };
        fs.writeFileSync(this.filePath, JSON.stringify(initial, null, 2), "utf8");
        return initial;
      }
      const raw = fs.readFileSync(this.filePath, "utf8");
      return JSON.parse(raw) as SessionDataFile;
    } catch (err) {
      throw new Error(`FILE_SESSION_STORE_UNAVAILABLE: Failed to access file session store: ${(err as Error).message}`);
    }
  }

  private saveStore(data: SessionDataFile): void {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(this.filePath, JSON.stringify(data));
        return;
      } catch {
        return;
      }
    }
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf8");
    } catch (err) {
      throw new Error(`FILE_SESSION_STORE_UNAVAILABLE: Failed to persist session store to disk: ${(err as Error).message}`);
    }
  }

  public async createSession(opaqueUserId: string): Promise<{ token: string; session: Session }> {
    const store = this.loadStore();
    const sessionId = generateRandomHex(16);
    const issuedAt = Date.now();
    const expiresAt = issuedAt + 24 * 60 * 60 * 1000;

    const session: Session = { sessionId, opaqueUserId, issuedAt, expiresAt };
    const payload = JSON.stringify(session);
    const hmac = generateHmacHex(SESSION_SECRET, payload);
    const token = stringToBase64Url(payload) + "." + hmac;

    store.sessions[sessionId] = session;
    this.saveStore(store);

    return { token, session };
  }

  public async validateSession(token: string): Promise<Session | null> {
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;

    try {
      const payloadStr = base64UrlToString(parts[0]);
      const expectedHmac = generateHmacHex(SESSION_SECRET, payloadStr);

      if (!safeCompare(parts[1], expectedHmac)) {
        return null;
      }

      const payload: Session = JSON.parse(payloadStr);

      if (Date.now() > payload.expiresAt) return null;

      const store = this.loadStore();
      if (store.revokedIds.includes(payload.sessionId)) return null;

      const storedSession = store.sessions[payload.sessionId];
      if (!storedSession || Date.now() > storedSession.expiresAt) return null;

      return payload;
    } catch (err: any) {
      if (err.message && err.message.includes("FILE_SESSION_STORE_UNAVAILABLE")) {
        throw err;
      }
      return null;
    }
  }

  public async revokeSession(sessionId: string): Promise<void> {
    const store = this.loadStore();
    if (!store.revokedIds.includes(sessionId)) {
      store.revokedIds.push(sessionId);
    }
    delete store.sessions[sessionId];
    this.saveStore(store);
  }

  public async isRevoked(sessionId: string): Promise<boolean> {
    const store = this.loadStore();
    return store.revokedIds.includes(sessionId);
  }

  public async revokeAllForUser(opaqueUserId: string): Promise<void> {
    const store = this.loadStore();
    for (const [sId, sess] of Object.entries(store.sessions)) {
      if (sess.opaqueUserId === opaqueUserId) {
        if (!store.revokedIds.includes(sId)) {
          store.revokedIds.push(sId);
        }
        delete store.sessions[sId];
      }
    }
    this.saveStore(store);
  }

  public async cleanupExpiredSessions(): Promise<number> {
    const store = this.loadStore();
    const now = Date.now();
    let cleaned = 0;
    for (const [sId, sess] of Object.entries(store.sessions)) {
      if (now > sess.expiresAt) {
        delete store.sessions[sId];
        cleaned++;
      }
    }
    if (cleaned > 0) {
      this.saveStore(store);
    }
    return cleaned;
  }
}

/**
 * 3. DatabaseDistributedSessionStore - Production shared backend session store (e.g. PostgreSQL)
 * Fails closed if database backend is unconfigured or unreachable in production.
 */
export class DatabaseDistributedSessionStore implements SessionStore {
  private pgPool: pg.Pool | null = null;
  private dbInitialized = false;

  constructor(private dbUrlOrPool?: string | pg.Pool) {
    if (typeof dbUrlOrPool === "object" && dbUrlOrPool !== null) {
      this.pgPool = dbUrlOrPool as pg.Pool;
    } else {
      const url = (typeof dbUrlOrPool === "string" ? dbUrlOrPool : undefined) || (typeof process !== "undefined" && process.env ? process.env.DATABASE_URL : undefined);
      if (url && (url.startsWith("postgres://") || url.startsWith("postgresql://"))) {
        this.pgPool = new pg.Pool({ connectionString: url, max: 10 });
      }
    }
  }

  private async ensurePgTable(): Promise<pg.Pool> {
    if (!this.pgPool) {
      throw new Error(
        "DISTRIBUTED_SESSION_STORE_UNAVAILABLE: DATABASE_URL environment variable is required for distributed session store."
      );
    }
    if (!this.dbInitialized) {
      try {
        await this.pgPool.query(`
          CREATE TABLE IF NOT EXISTS sessions (
            session_id text primary key,
            opaque_user_id text,
            issued_at bigint,
            expires_at bigint,
            revoked boolean
          )
        `);
        await this.pgPool.query(`CREATE INDEX IF NOT EXISTS idx_sessions_opaque_user ON sessions(opaque_user_id)`);
        await this.pgPool.query(`CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)`);
        this.dbInitialized = true;
      } catch (err) {
        throw new Error(
          `DISTRIBUTED_SESSION_STORE_UNAVAILABLE: Failed to initialize PostgreSQL session tables: ${(err as Error).message}`
        );
      }
    }
    return this.pgPool;
  }

  public async createSession(opaqueUserId: string): Promise<{ token: string; session: Session }> {
    const pool = await this.ensurePgTable();
    const sessionId = generateRandomHex(16);
    const issuedAt = Date.now();
    const expiresAt = issuedAt + 24 * 60 * 60 * 1000;

    const session: Session = { sessionId, opaqueUserId, issuedAt, expiresAt };
    const payload = JSON.stringify(session);
    const hmac = generateHmacHex(SESSION_SECRET, payload);
    const token = stringToBase64Url(payload) + "." + hmac;

    try {
      await pool.query(
        "INSERT INTO sessions (session_id, opaque_user_id, issued_at, expires_at, revoked) VALUES ($1, $2, $3, $4, FALSE)",
        [sessionId, opaqueUserId, issuedAt, expiresAt]
      );
    } catch (err) {
      throw new Error(`DISTRIBUTED_SESSION_STORE_UNAVAILABLE: Failed to persist session: ${(err as Error).message}`);
    }

    return { token, session };
  }

  public async validateSession(token: string): Promise<Session | null> {
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;

    let payload: Session;
    try {
      const payloadStr = base64UrlToString(parts[0]);
      const expectedHmac = generateHmacHex(SESSION_SECRET, payloadStr);

      if (!safeCompare(parts[1], expectedHmac)) {
        return null;
      }

      payload = JSON.parse(payloadStr);
      if (Date.now() > payload.expiresAt) return null;
    } catch {
      return null;
    }

    const pool = await this.ensurePgTable();
    try {
      const res = await pool.query(
        "SELECT revoked, expires_at FROM sessions WHERE session_id = $1",
        [payload.sessionId]
      );

      if (res.rows.length === 0) return null;
      if (res.rows[0].revoked) return null;
      if (Date.now() > Number(res.rows[0].expires_at)) return null;

      return payload;
    } catch (err) {
      throw new Error(`DISTRIBUTED_SESSION_STORE_UNAVAILABLE: Database query failed: ${(err as Error).message}`);
    }
  }

  public async revokeSession(sessionId: string): Promise<void> {
    const pool = await this.ensurePgTable();
    try {
      await pool.query("UPDATE sessions SET revoked = TRUE WHERE session_id = $1", [sessionId]);
    } catch (err) {
      throw new Error(`DISTRIBUTED_SESSION_STORE_UNAVAILABLE: Revoke session failed: ${(err as Error).message}`);
    }
  }

  public async isRevoked(sessionId: string): Promise<boolean> {
    const pool = await this.ensurePgTable();
    try {
      const res = await pool.query("SELECT revoked FROM sessions WHERE session_id = $1", [sessionId]);
      if (res.rows.length === 0) return true;
      return res.rows[0].revoked === true;
    } catch (err) {
      throw new Error(`DISTRIBUTED_SESSION_STORE_UNAVAILABLE: Check revoked failed: ${(err as Error).message}`);
    }
  }

  public async revokeAllForUser(opaqueUserId: string): Promise<void> {
    const pool = await this.ensurePgTable();
    try {
      await pool.query("UPDATE sessions SET revoked = TRUE WHERE opaque_user_id = $1", [opaqueUserId]);
    } catch (err) {
      throw new Error(`DISTRIBUTED_SESSION_STORE_UNAVAILABLE: Revoke user sessions failed: ${(err as Error).message}`);
    }
  }

  public async cleanupExpiredSessions(): Promise<number> {
    const pool = await this.ensurePgTable();
    try {
      const res = await pool.query("DELETE FROM sessions WHERE expires_at < $1", [Date.now()]);
      return res.rowCount || 0;
    } catch (err) {
      throw new Error(`DISTRIBUTED_SESSION_STORE_UNAVAILABLE: Session cleanup failed: ${(err as Error).message}`);
    }
  }
}

/**
 * SessionStore Factory - Selects session store implementation according to environment configuration.
 * Never silently degrades to memory/file if "distributed" is specified or required in production.
 */
export function getSessionStore(): SessionStore {
  const provider =
    (typeof process !== "undefined" && process.env && process.env.SESSION_STORE_PROVIDER) ||
    (typeof process !== "undefined" && process.env && process.env.NODE_ENV === "production" ? "distributed" : "file");

  if (provider === "distributed") {
    return new DatabaseDistributedSessionStore();
  } else if (provider === "memory") {
    return new InMemorySessionStore();
  } else {
    return new FileSessionStore();
  }
}

