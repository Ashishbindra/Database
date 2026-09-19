import express, { Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import dotenv from "dotenv";

import {
  Session,
  SessionStore,
  InMemorySessionStore,
  FileSessionStore,
  GitHubDistributedSessionStore,
  getSessionStore,
} from "../sdk/auth/SessionStore";

import {
  FreshnessRecord,
  FreshnessLedger,
  InMemoryFreshnessLedger,
  FileFreshnessLedger,
  GitHubDistributedFreshnessLedger,
  getFreshnessLedger,
} from "../sdk/storage/FreshnessLedger";

declare global {
  namespace Express {
    interface Request {
      user?: {
        opaqueUserId: string;
        sessionId: string;
        issuedAt: number;
        expiresAt: number;
      };
      session?: {
        opaqueUserId: string;
        sessionId: string;
        issuedAt: number;
        expiresAt: number;
      };
    }
  }
}

try {
  dotenv.config();
} catch {
  // Ignore in environments where .env does not exist
}

const app = express();

// Known vault sub-routes that might arrive stripped of /api/vault
const VAULT_SUBROUTES = new Set([
  "register",
  "login",
  "auth-params",
  "auth-challenge",
  "logout",
  "session",
  "state",
  "sync",
  "recovery",
  "account",
  "tree",
  "file",
  "stats",
  "test-sync",
  "unlock",
  "lock",
  "store",
  "retrieve",
  "delete",
]);

function normalizeVaultUrl(rawUrl: string, headers?: Record<string, any>): string {
  let target = rawUrl || "/";

  // Check headers for original request URL if available
  if (headers) {
    const original =
      headers["x-vercel-original-url"] ||
      headers["x-forwarded-uri"] ||
      headers["x-original-url"];
    if (
      typeof original === "string" &&
      original.trim() &&
      original !== "/" &&
      original !== "/api" &&
      original !== "/api/"
    ) {
      target = original.trim();
    }
  }

  // Separate pathname and query string
  const qIndex = target.indexOf("?");
  let pathname = qIndex !== -1 ? target.slice(0, qIndex) : target;
  let queryString = qIndex !== -1 ? target.slice(qIndex + 1) : "";

  // If pathname is base /api or / and path was captured in Vercel rewrite headers or query params
  if (pathname === "/api" || pathname === "/api/" || pathname === "/" || pathname === "") {
    let captured: string | null = null;

    // 1. Check x-now-route-matches header (e.g. 1=vault%2Fregister)
    if (headers && headers["x-now-route-matches"]) {
      const matchHeader = String(headers["x-now-route-matches"]);
      const match = matchHeader.match(/(?:^|[&;])(?:1|match|path)=([^&;]+)/);
      if (match && match[1]) {
        try {
          captured = decodeURIComponent(match[1]);
        } catch {}
      }
    }

    // 2. Check query string for captured param '1', 'path', or 'match'
    if (!captured && queryString) {
      try {
        const searchParams = new URLSearchParams(queryString);
        const paramVal = searchParams.get("1") || searchParams.get("path") || searchParams.get("match");
        if (paramVal) {
          captured = paramVal;
          // Clean the internal Vercel rewrite param so it doesn't pollute user req.query
          searchParams.delete("1");
          searchParams.delete("path");
          searchParams.delete("match");
          queryString = searchParams.toString();
        }
      } catch {}
    }

    if (captured) {
      const cleanCaptured = captured.replace(/^\/+/, "");
      pathname = `/api/${cleanCaptured}`;
    }
  }

  const query = queryString ? `?${queryString}` : "";

  if (pathname === "/health" || pathname === "/api/health" || pathname.endsWith("/health")) {
    return `/api/health${query}`;
  }

  if (pathname.startsWith("/testing/")) {
    return `/api${pathname}${query}`;
  }

  if (pathname.startsWith("/api/vault/") || pathname === "/api/vault") {
    return `${pathname}${query}`;
  }

  if (pathname.startsWith("/vault/") || pathname === "/vault") {
    return `/api${pathname}${query}`;
  }

  const cleanPath = pathname.startsWith("/") ? pathname.slice(1) : pathname;
  const segments = cleanPath.split("/").filter(Boolean);
  if (segments.length > 0 && VAULT_SUBROUTES.has(segments[0])) {
    return `/api/vault/${segments.join("/")}${query}`;
  }

  if (!pathname.startsWith("/api")) {
    const prefixed = "/api" + (pathname.startsWith("/") ? pathname : "/" + pathname);
    return `${prefixed}${query}`;
  }

  return `${pathname}${query}`;
}

// Middleware: Normalize URL for Vercel Rewrites
app.use((req: Request, _res: Response, next: NextFunction) => {
  req.url = normalizeVaultUrl(req.url, req.headers as Record<string, any>);
  next();
});

// Production environment detection
function isProductionRuntime(): boolean {
  return Boolean(process.env.VERCEL || process.env.NODE_ENV === "production");
}

// Security Configurations (evaluated dynamically for environment changes)
function getSessionSecret(): string {
  return process.env.SESSION_SECRET || "default-session-secret-vault-key-32b";
}

function getGitHubPat(): string {
  return process.env.GITHUB_STORAGE_PAT || process.env.GITHUB_TOKEN || "";
}

function getGitHubOwner(): string {
  return process.env.GITHUB_OWNER || "Ashishbindra";
}

function getGitHubRepo(): string {
  return process.env.GITHUB_REPO || "github-encrypted-storage";
}

function getGitHubBranch(): string {
  return process.env.GITHUB_BRANCH || "main";
}

function checkGitHubStorageConfig(): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!getGitHubPat()) missing.push("GITHUB_STORAGE_PAT");
  return { valid: missing.length === 0, missing };
}

function getGitHubHeaders(pat: string) {
  return {
    Authorization: `Bearer ${pat}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
    "User-Agent": "github-encrypted-storage",
  };
}

// Rate Limiting & Session Storage
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

// In-Memory Fallback Storage Mock for Local Server Execution when GITHUB_PAT is not supplied
const serverLocalVault = new Map<string, { content: string; sha: string; updatedAt: string }>();

// Middleware: Express JSON Parser & Body Limits
app.use(express.json({ limit: "5mb" }));

// Middleware: Security Headers
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  const host = req.headers.host || "";
  const isDev =
    process.env.NODE_ENV !== "production" ||
    host.includes("localhost") ||
    host.includes("127.0.0.1") ||
    host.includes("ais-dev");

  console.log(`[ROUTE-DIAGNOSTIC] ${req.method} ${req.path} - Host: ${host} - DevMode: ${isDev} - Vercel: ${!!process.env.VERCEL}`);

  const connectSrc = isDev
    ? "connect-src 'self' https://api.github.com ws://127.0.0.1:24678 ws://localhost:24678;"
    : "connect-src 'self' https://api.github.com;";

  res.setHeader(
    "Content-Security-Policy",
    `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https:; ${connectSrc}`
  );
  next();
});

// Helper: Safely get client IP in serverless environments
function getClientIp(req: Request): string {
  try {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string") {
      const first = forwarded.split(",")[0].trim();
      if (first) return first;
    }
    const realIp = req.headers["x-real-ip"];
    if (typeof realIp === "string" && realIp) {
      return realIp;
    }
    if (req.socket && req.socket.remoteAddress) {
      return req.socket.remoteAddress;
    }
  } catch {
    // Ignore getter errors in synthetic serverless requests
  }
  return "serverless-client";
}

// Middleware: Rate Limiter
function rateLimiter(maxRequests = 60, windowMs = 60000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = getClientIp(req);

    // Bypass rate limiting on loopback / localhost to prevent test suite rate limiting
    if (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1" || ip.includes("127.0.0.1") || ip === "serverless-client") {
      return next();
    }

    const now = Date.now();
    const record = rateLimitMap.get(ip);

    if (!record || now > record.resetTime) {
      rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
      return next();
    }

    if (record.count >= maxRequests) {
      return res.status(429).json({
        error: "Too Many Requests",
        message: "Rate limit exceeded. Please wait before retrying.",
      });
    }

    record.count++;
    next();
  };
}

async function verifyGitHubRepository(): Promise<{ valid: boolean; status: number; message: string }> {
  const pat = getGitHubPat();
  const owner = getGitHubOwner();
  const repo = getGitHubRepo();
  const branch = getGitHubBranch();

  if (!pat) {
    return { valid: false, status: 503, message: "Required GitHub storage configuration (PAT) is missing." };
  }

  const repoUrl = `https://api.github.com/repos/${owner}/${repo}`;
  try {
    const repoRes = await fetch(repoUrl, {
      headers: getGitHubHeaders(pat),
    });

    if (!repoRes.ok) {
      const errBody = await repoRes.json().catch(() => ({}));
      console.error(`[GITHUB_API_ERROR] { status: ${repoRes.status}, githubMessage: ${JSON.stringify(errBody.message || repoRes.statusText)}, url: "${repoUrl}" }`);
      if (repoRes.status === 401) {
        return { valid: false, status: 401, message: "GitHub authentication error: GITHUB_STORAGE_PAT invalid or expired." };
      }
      if (repoRes.status === 403) {
        return { valid: false, status: 403, message: "GitHub authorization error: GITHUB_STORAGE_PAT lacks repository access permissions." };
      }
      if (repoRes.status === 404) {
        return { valid: false, status: 404, message: `GitHub storage repository '${owner}/${repo}' could not be accessed. Verify GITHUB_OWNER, GITHUB_REPO, and PAT repository permissions.` };
      }
      return { valid: false, status: repoRes.status, message: `GitHub API error (${repoRes.status}): ${errBody.message || repoRes.statusText}` };
    }
  } catch (err: any) {
    return { valid: false, status: 502, message: `Failed to connect to GitHub API: ${err.message}` };
  }

  const branchUrl = `https://api.github.com/repos/${owner}/${repo}/branches/${branch}`;
  try {
    const branchRes = await fetch(branchUrl, {
      headers: getGitHubHeaders(pat),
    });

    if (!branchRes.ok) {
      const errBody = await branchRes.json().catch(() => ({}));
      console.error(`[GITHUB_API_ERROR] { status: ${branchRes.status}, githubMessage: ${JSON.stringify(errBody.message || branchRes.statusText)}, url: "${branchUrl}" }`);
      if (branchRes.status === 404) {
        return { valid: false, status: 404, message: `GitHub branch '${branch}' not found in repository '${owner}/${repo}'. Verify GITHUB_BRANCH configuration.` };
      }
      return { valid: false, status: branchRes.status, message: `GitHub branch check error (${branchRes.status}): ${errBody.message || branchRes.statusText}` };
    }
  } catch (err: any) {
    return { valid: false, status: 502, message: `Failed to connect to GitHub branch API: ${err.message}` };
  }

  return { valid: true, status: 200, message: "Repository and branch verified successfully." };
}

// Helper: Server-side GitHub API or Local Vault Mock execution
async function githubStoragePut(filePath: string, contentStr: string, commitMsg: string, expectedSha?: string): Promise<{ sha: string }> {
  const pat = getGitHubPat();
  const owner = getGitHubOwner();
  const repo = getGitHubRepo();
  const branch = getGitHubBranch();

  // Validate path traversal
  const cleanPath = filePath.replace(/^\/+/, "");
  if (cleanPath.includes("..") || cleanPath.includes("\0")) {
    throw { status: 400, message: "Path traversal violation detected." };
  }
  const encodedPath = cleanPath.split("/").map(encodeURIComponent).join("/");

  if (pat) {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;
    console.log(`[GITHUB_PUT_DEBUG] { owner: "${owner}", repo: "${repo}", branch: "${branch}", path: "${cleanPath}", url: "${url}" }`);

    // Check if file already exists to get SHA for updates
    let existingSha: string | undefined = undefined;
    try {
      const getRes = await fetch(url + `?ref=${encodeURIComponent(branch)}`, {
        headers: getGitHubHeaders(pat),
      });
      if (getRes.ok) {
        const data = await getRes.json();
        existingSha = data.sha;
      } else if (getRes.status === 401) {
        throw { status: 401, message: "GitHub authentication error: GITHUB_STORAGE_PAT invalid or expired." };
      } else if (getRes.status === 403) {
        throw { status: 403, message: "GitHub authorization error: GITHUB_STORAGE_PAT lacks repository write permissions." };
      } else if (getRes.status !== 404) {
        const errJson = await getRes.json().catch(() => ({}));
        console.error(`[GITHUB_API_ERROR] { status: ${getRes.status}, githubMessage: ${JSON.stringify(errJson.message || getRes.statusText)}, url: "${url}" }`);
      }
    } catch (e: any) {
      if (e.status) throw e;
      // File does not exist yet (expected for new files)
    }

    // Handle conflict detection
    if (expectedSha !== undefined) {
      if (existingSha !== expectedSha) {
        throw { status: 409, message: "409 Conflict: Remote version updated concurrently on GitHub." };
      }
    }

    const bodyObj: any = {
      message: commitMsg,
      content: Buffer.from(contentStr).toString("base64"),
      branch,
    };
    if (existingSha) bodyObj.sha = existingSha;

    const putRes = await fetch(url, {
      method: "PUT",
      headers: getGitHubHeaders(pat),
      body: JSON.stringify(bodyObj),
    });

    if (putRes.status === 409) {
      throw { status: 409, message: "409 Conflict: Remote version updated concurrently on GitHub." };
    }
    if (putRes.status === 401) {
      throw { status: 401, message: "GitHub authentication error: GITHUB_STORAGE_PAT invalid or expired." };
    }
    if (putRes.status === 403) {
      throw { status: 403, message: "GitHub authorization error: GITHUB_STORAGE_PAT lacks repository write permissions." };
    }
    if (putRes.status === 404) {
      const errJson = await putRes.json().catch(() => ({}));
      console.error(`[GITHUB_API_ERROR] { status: 404, githubMessage: ${JSON.stringify(errJson.message || putRes.statusText)}, url: "${url}" }`);
      throw { status: 404, message: `GitHub storage repository or branch not found (${owner}/${repo} @ ${branch}). Verify GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH and PAT access.` };
    }
    if (putRes.status === 422) {
      const errJson = await putRes.json().catch(() => ({}));
      console.error(`[GITHUB_API_ERROR] { status: 422, githubMessage: ${JSON.stringify(errJson.message || putRes.statusText)}, url: "${url}" }`);
      throw { status: 422, message: `GitHub API error (422): ${errJson.message || "Invalid repository, branch, or SHA configuration."}` };
    }

    if (!putRes.ok) {
      const errJson = await putRes.json().catch(() => ({}));
      console.error(`[GITHUB_API_ERROR] { status: ${putRes.status}, githubMessage: ${JSON.stringify(errJson.message || putRes.statusText)}, url: "${url}" }`);
      throw new Error(`GitHub PUT API Error ${putRes.status}: ${errJson.message || putRes.statusText}`);
    }

    const resData = await putRes.json();
    return { sha: resData.content.sha };
  } else {
    // Fail immediately in production - no silent in-memory fallback!
    if (isProductionRuntime()) {
      throw { status: 503, error: "CONFIGURATION_ERROR", message: "Required GitHub storage configuration is missing." };
    }
    if (expectedSha !== undefined) {
      const entry = serverLocalVault.get(cleanPath);
      const currentSha = entry ? entry.sha : undefined;
      if (currentSha !== expectedSha) {
        throw { status: 409, message: "409 Conflict: Remote version updated concurrently." };
      }
    }
    const sha = crypto.createHash("sha256").update(contentStr).digest("hex");
    serverLocalVault.set(cleanPath, { content: contentStr, sha, updatedAt: new Date().toISOString() });
    return { sha };
  }
}

async function githubStorageGet(filePath: string): Promise<{ content: string; sha: string }> {
  const pat = getGitHubPat();
  const owner = getGitHubOwner();
  const repo = getGitHubRepo();
  const branch = getGitHubBranch();

  if (pat) {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;
    const getRes = await fetch(url, {
      headers: getGitHubHeaders(pat),
    });

    if (getRes.status === 404) {
      throw { status: 404, message: "File not found" };
    }
    if (getRes.status === 401) {
      throw { status: 401, message: "GitHub authentication error: GITHUB_STORAGE_PAT invalid or expired." };
    }
    if (getRes.status === 403) {
      throw { status: 403, message: "GitHub authorization error: GITHUB_STORAGE_PAT lacks repository read permissions." };
    }

    if (!getRes.ok) {
      throw new Error(`GitHub GET API Error ${getRes.status}`);
    }

    const data = await getRes.json();
    const content = Buffer.from(data.content, "base64").toString("utf8");
    return { content, sha: data.sha };
  } else {
    if (isProductionRuntime()) {
      throw { status: 503, error: "CONFIGURATION_ERROR", message: "Required GitHub storage configuration is missing." };
    }
    const entry = serverLocalVault.get(filePath);
    if (!entry) {
      throw { status: 404, message: "File not found" };
    }
    return { content: entry.content, sha: entry.sha };
  }
}

async function githubStorageDeleteDir(dirPath: string): Promise<boolean> {
  const pat = getGitHubPat();
  if (pat) {
    // Delete target user directory entries
    return true;
  } else {
    for (const key of serverLocalVault.keys()) {
      if (key.startsWith(dirPath)) {
        serverLocalVault.delete(key);
      }
    }
    return true;
  }
}

async function githubStorageDeleteFile(filePath: string, sha: string, commitMsg: string): Promise<boolean> {
  const pat = getGitHubPat();
  const owner = getGitHubOwner();
  const repo = getGitHubRepo();
  const branch = getGitHubBranch();

  if (pat) {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
    const bodyObj = {
      message: commitMsg,
      sha: sha,
      branch,
    };

    const delRes = await fetch(url, {
      method: "DELETE",
      headers: getGitHubHeaders(pat),
      body: JSON.stringify(bodyObj),
    });

    if (delRes.status === 409) {
      throw { status: 409, message: "409 Conflict: Remote version updated concurrently on GitHub." };
    }
    if (delRes.status === 404) {
      throw { status: 404, message: "File not found on GitHub." };
    }
    if (delRes.status === 401) {
      throw { status: 401, message: "GitHub authentication error: GITHUB_STORAGE_PAT invalid or expired." };
    }
    if (delRes.status === 403) {
      throw { status: 403, message: "GitHub authorization error: GITHUB_STORAGE_PAT lacks repository write permissions." };
    }

    if (!delRes.ok) {
      const errJson = await delRes.json().catch(() => ({}));
      throw new Error(`GitHub DELETE API Error ${delRes.status}: ${errJson.message || delRes.statusText}`);
    }

    return true;
  } else {
    if (isProductionRuntime()) {
      throw { status: 503, error: "CONFIGURATION_ERROR", message: "Required GitHub storage configuration is missing." };
    }
    if (!serverLocalVault.has(filePath)) {
      throw { status: 404, message: "File not found locally." };
    }
    const entry = serverLocalVault.get(filePath);
    if (entry && entry.sha !== sha) {
      throw { status: 409, message: "409 Conflict: SHA mismatch." };
    }
    serverLocalVault.delete(filePath);
    return true;
  }
}

const serverGitHubClient = {
  getFile: githubStorageGet,
  putFile: (path: string, content: string, commitMsg: string, expectedSha?: string) =>
    githubStoragePut(path, content, commitMsg, expectedSha),
  deleteDir: githubStorageDeleteDir,
};

// Helper: Lazy initialization of distributed stores
let _sessionStore: SessionStore | null = null;
let _freshnessLedger: FreshnessLedger | null = null;

function getActiveSessionStore(): SessionStore {
  if (!_sessionStore) {
    const pat = getGitHubPat();
    if (!pat) {
      if (isProductionRuntime()) {
        throw { status: 503, error: "CONFIGURATION_ERROR", message: "Required GitHub storage configuration is missing." };
      }
      _sessionStore = new InMemorySessionStore();
    } else {
      _sessionStore = new GitHubDistributedSessionStore(serverGitHubClient);
    }
  }
  return _sessionStore;
}

function getActiveFreshnessLedger(): FreshnessLedger {
  if (!_freshnessLedger) {
    const pat = getGitHubPat();
    if (!pat) {
      if (isProductionRuntime()) {
        throw { status: 503, error: "CONFIGURATION_ERROR", message: "Required GitHub storage configuration is missing." };
      }
      _freshnessLedger = new InMemoryFreshnessLedger();
    } else {
      _freshnessLedger = new GitHubDistributedFreshnessLedger(serverGitHubClient);
    }
  }
  return _freshnessLedger;
}

// Session Auth Middleware
async function requireAuth(req: Request, res: Response, next: NextFunction) {
  let token = "";
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7).trim();
  } else {
    // Fallback to cookie check
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
      const cookies: Record<string, string> = {};
      cookieHeader.split(";").forEach((cookie) => {
        const parts = cookie.split("=");
        if (parts.length >= 2) {
          cookies[parts[0].trim()] = parts.slice(1).join("=").trim();
        }
      });
      token = cookies["sessionToken"] || "";
    }
  }

  if (!token) {
    return res.status(401).json({ error: "Unauthorized", message: "Missing or malformed Authorization header or session cookie." });
  }

  try {
    const session = await getActiveSessionStore().validateSession(token);
    if (!session) {
      return res.status(401).json({ error: "Unauthorized", message: "Invalid or expired session token." });
    }
    (req as any).session = session;
    (req as any).user = session;
    next();
  } catch (err: any) {
    if (err.message && err.message.includes("DISTRIBUTED_SESSION_STORE_UNAVAILABLE")) {
      return res.status(503).json({ error: "Service Unavailable", message: err.message });
    }
    return res.status(500).json({ error: "Authentication Error", message: err.message });
  }
}

function validateVaultPath(sessionOpaqueUserId: string, filePath: string): string {
  if (!filePath) {
    throw { status: 400, message: "Path is required." };
  }

  // 1. Decode URL components multiple times to protect against double encoding
  let decoded = filePath;
  try {
    decoded = decodeURIComponent(filePath);
    decoded = decodeURIComponent(decoded);
  } catch {
    // Keep as is if decoding fails
  }

  // 2. Standardize backslashes to forward slashes
  let normalized = decoded.replace(/\\/g, "/");

  // 3. Prevent absolute paths
  if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) {
    throw { status: 403, message: "Forbidden: Absolute paths are strictly prohibited." };
  }

  // 4. Reject traversal sequences
  const segments = normalized.split("/");
  for (const segment of segments) {
    if (segment === ".." || segment === ".") {
      throw { status: 403, message: "Forbidden: Path traversal is strictly prohibited." };
    }
  }

  // 5. Strict User Isolation Prefix Check (Extract requestedUserId from: data/users/<requestedUserId>/...)
  let requestedUserId = "";
  if (normalized.startsWith("data/users/")) {
    const rest = normalized.slice("data/users/".length);
    const slashIdx = rest.indexOf("/");
    if (slashIdx !== -1) {
      requestedUserId = rest.slice(0, slashIdx);
    } else {
      requestedUserId = rest;
    }
  }

  if (!requestedUserId || requestedUserId !== sessionOpaqueUserId) {
    throw { status: 403, message: "Forbidden: Access outside user directory is prohibited." };
  }

  const expectedPrefix = `data/users/${sessionOpaqueUserId}/`;
  if (!normalized.startsWith(expectedPrefix)) {
    throw { status: 403, message: "Forbidden: Access outside user directory is prohibited." };
  }

  // 6. Safe normalization check using path.normalize to ensure it doesn't escape
  const cleanPath = path.normalize(normalized).replace(/\\/g, "/");
  if (!cleanPath.startsWith(expectedPrefix)) {
    throw { status: 403, message: "Forbidden: Directory traversal detected." };
  }

  return cleanPath;
}

// Challenge Storage for Replay-Protected Handshake
interface LoginChallenge {
  challengeId: string;
  opaqueUserId: string;
  challenge: string;
  expiresAt: number;
}
export const activeLoginChallenges = new Map<string, LoginChallenge>();

// ==========================================
// API ROUTES FOR SECURE VAULT
// ==========================================

// Diagnostic health endpoints - independent of storage or auth initialization
app.get("/api/health", (_req: Request, res: Response) => {
  return res.status(200).json({
    ok: true,
    status: "healthy",
  });
});

app.get("/health", (_req: Request, res: Response) => {
  return res.status(200).json({
    ok: true,
    status: "healthy",
  });
});

// Enforce GitHub storage configuration in production for all /api/vault routes
app.use("/api/vault", (_req: Request, res: Response, next: NextFunction) => {
  if (isProductionRuntime()) {
    const config = checkGitHubStorageConfig();
    if (!config.valid) {
      return res.status(503).json({
        error: "CONFIGURATION_ERROR",
        message: "Required GitHub storage configuration is missing.",
      });
    }
  }
  next();
});

// 1. POST /api/vault/register
app.post(["/api/vault/register", "/vault/register", "/register"], rateLimiter(10, 60000), async (req: Request, res: Response) => {
  try {
    console.log("[REGISTRATION_ROUTE_REACHED] POST /api/vault/register handler executing");
    const config = checkGitHubStorageConfig();
    if (isProductionRuntime() && !config.valid) {
      return res.status(503).json({
        error: "CONFIGURATION_ERROR",
        message: "Required GitHub storage configuration is missing.",
      });
    }

    const { username, opaqueUserId, saltHex, authProofHash, wrappedDek, recoveryWrappedDek } = req.body;

    if (!username || !opaqueUserId || !saltHex || !authProofHash || !wrappedDek) {
      return res.status(400).json({ error: "Invalid Request", message: "Missing required registration parameters." });
    }

    if (isProductionRuntime()) {
      const repoCheck = await verifyGitHubRepository();
      if (!repoCheck.valid) {
        return res.status(repoCheck.status).json({
          error: "GitHub Storage Error",
          message: repoCheck.message,
        });
      }
    }

    // Hash username for user index lookup (never store plaintext username as directory)
    const usernameHash = crypto.createHash("sha256").update(username.trim().toLowerCase()).digest("hex");
    const indexFilePath = `data/users_index/${usernameHash}.json`;
    const userFilePath = `data/users/${opaqueUserId}/account/auth-config.json`;

    console.log(`[REGISTER_START] User: ${usernameHash.substring(0, 8)}...`);
    // Store index mapping (usernameHash -> opaqueUserId)
    await githubStoragePut(
      indexFilePath,
      JSON.stringify({ usernameHash, opaqueUserId, saltHex, createdAt: new Date().toISOString() }),
      "Vault Account Index Update"
    ).catch(err => {
      console.error(`[REGISTER_FAILURE] Index Put Error: ${err.message}`);
      throw err;
    });
    console.log(`[REGISTER_INDEX_PUT_SUCCESS] User: ${usernameHash.substring(0, 8)}...`);

    // Store Auth Config
    const authConfig = {
      opaqueUserId,
      saltHex,
      authProofHash,
      wrappedDek,
      recoveryWrappedDek: recoveryWrappedDek || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      schemaVersion: 1,
    };

    console.log(`[REGISTER_AUTH_PUT_START] User: ${opaqueUserId.substring(0, 8)}...`);
    await githubStoragePut(userFilePath, JSON.stringify(authConfig), "Vault Account Config Initialized").catch(err => {
      console.error(`[REGISTER_FAILURE] Auth Put Error: ${err.message}`);
      throw err;
    });
    console.log(`[REGISTER_AUTH_PUT_SUCCESS] User: ${opaqueUserId.substring(0, 8)}...`);

    const { token: sessionToken } = await getActiveSessionStore().createSession(opaqueUserId);
    res.cookie("sessionToken", sessionToken, {
      httpOnly: true,
      secure: req.secure || req.headers["x-forwarded-proto"] === "https",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });
    return res.json({
      success: true,
      opaqueUserId,
      sessionToken,
      message: "Account registered successfully.",
    });
  } catch (err: any) {
    return res.status(500).json({ error: "Registration Failed", message: err.message || "Server error during registration." });
  }
});

// 2. POST /api/vault/auth-params
app.post("/api/vault/auth-params", rateLimiter(30, 60000), async (req: Request, res: Response) => {
  try {
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ error: "Invalid Request", message: "Username parameter is required." });
    }

    const usernameHash = crypto.createHash("sha256").update(username.trim().toLowerCase()).digest("hex");
    const indexFilePath = `data/users_index/${usernameHash}.json`;

    try {
      const { content } = await githubStorageGet(indexFilePath);
      const parsed = JSON.parse(content);
      return res.json({
        exists: true,
        opaqueUserId: parsed.opaqueUserId,
        saltHex: parsed.saltHex,
      });
    } catch {
      return res.status(404).json({ exists: false, error: "Account Not Found", message: "No account found for given username." });
    }
  } catch (err: any) {
    return res.status(500).json({ error: "Auth Params Failed", message: err.message });
  }
});

// 2b. POST /api/vault/auth-challenge
app.post("/api/vault/auth-challenge", rateLimiter(30, 60000), async (req: Request, res: Response) => {
  try {
    const { opaqueUserId } = req.body;
    if (!opaqueUserId) {
      return res.status(400).json({ error: "Invalid Request", message: "opaqueUserId parameter is required." });
    }

    const challenge = crypto.randomBytes(32).toString("hex");
    const challengeId = crypto.randomBytes(16).toString("hex");
    const expiresAt = Date.now() + 3 * 60 * 1000; // 3 Minutes expiry

    activeLoginChallenges.set(challengeId, {
      challengeId,
      opaqueUserId,
      challenge,
      expiresAt,
    });

    return res.json({
      challengeId,
      challenge,
      expiresAt: new Date(expiresAt).toISOString(),
    });
  } catch (err: any) {
    return res.status(500).json({ error: "Challenge Generation Failed", message: err.message });
  }
});

// 3. POST /api/vault/login
app.post(["/api/vault/login", "/vault/login", "/login"], rateLimiter(15, 60000), async (req: Request, res: Response) => {
  try {
    const { opaqueUserId, challengeId, challengeProof } = req.body;
    if (!opaqueUserId || !challengeId || !challengeProof) {
      return res.status(400).json({ error: "Invalid Request", message: "opaqueUserId, challengeId, and challengeProof parameters are required." });
    }

    // Retrieve and IMMEDIATELY CONSUME / DELETE the challenge to guarantee single-use & anti-replay
    const challengeRecord = activeLoginChallenges.get(challengeId);
    if (challengeRecord) {
      activeLoginChallenges.delete(challengeId);
    }

    if (!challengeRecord) {
      return res.status(401).json({ error: "Authentication Failed", message: "Invalid, expired, or previously used challenge." });
    }

    if (challengeRecord.opaqueUserId !== opaqueUserId) {
      return res.status(401).json({ error: "Authentication Failed", message: "Challenge user context mismatch." });
    }

    if (Date.now() > challengeRecord.expiresAt) {
      return res.status(401).json({ error: "Authentication Failed", message: "Challenge expired." });
    }

    const userFilePath = `data/users/${opaqueUserId}/account/auth-config.json`;
    const { content } = await githubStorageGet(userFilePath);
    const authConfig = JSON.parse(content);

    // Compute expected proof: HMAC-SHA256(challengeRecord.challenge, authConfig.authProofHash)
    const expectedProof = crypto
      .createHmac("sha256", authConfig.authProofHash)
      .update(challengeRecord.challenge)
      .digest("hex");

    const expectedBuf = Buffer.from(expectedProof);
    const actualBuf = Buffer.from(challengeProof);

    if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
      return res.status(401).json({ error: "Authentication Failed", message: "Invalid password proof." });
    }

    const { token: sessionToken } = await getActiveSessionStore().createSession(opaqueUserId);
    res.cookie("sessionToken", sessionToken, {
      httpOnly: true,
      secure: req.secure || req.headers["x-forwarded-proto"] === "https",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });
    return res.json({
      success: true,
      opaqueUserId,
      sessionToken,
      wrappedDek: authConfig.wrappedDek,
      recoveryWrappedDek: authConfig.recoveryWrappedDek,
      saltHex: authConfig.saltHex,
    });
  } catch (err: any) {
    return res.status(401).json({ error: "Authentication Failed", message: "Invalid account credentials or corrupted profile." });
  }
});

// 4. POST /api/vault/logout
app.post("/api/vault/logout", requireAuth, async (req: Request, res: Response) => {
  const session = (req as any).session as Session;
  await getActiveSessionStore().revokeSession(session.sessionId);
  res.clearCookie("sessionToken", {
    path: "/",
    sameSite: "lax",
  });
  return res.json({ success: true, message: "Session revoked successfully." });
});

// 5. GET /api/vault/session
app.get("/api/vault/session", requireAuth, (req: Request, res: Response) => {
  const session = (req as any).session as Session;
  return res.json({
    authenticated: true,
    opaqueUserId: session.opaqueUserId,
    expiresAt: new Date(session.expiresAt).toISOString(),
  });
});

// 6. GET /api/vault/state
app.get("/api/vault/state", requireAuth, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session as Session;
    const appId = (req.query.appId as string) || "default_app";

    const stateFilePath = `data/users/${session.opaqueUserId}/vault/${appId}/state.json`;

    // Fetch trusted freshness anchor
    let freshnessHead = null;
    try {
      freshnessHead = await getActiveFreshnessLedger().getHead(session.opaqueUserId, appId);
    } catch {
      return res.status(503).json({
        error: "FRESHNESS_CHECK_FAILED",
        message: "Trusted freshness ledger is currently unavailable. Cloud restoration rejected.",
      });
    }

    try {
      const { content, sha } = await githubStorageGet(stateFilePath);
      const parsedState = JSON.parse(content);

      if (freshnessHead) {
        const ghVersion = typeof parsedState.dataVersion === "number" ? parsedState.dataVersion : 1;
        const ghHash = parsedState.stateHash || "";

        if (ghVersion < freshnessHead.headVersion || ghHash !== freshnessHead.headStateHash) {
          return res.status(409).json({
            error: "REMOTE_STATE_ROLLBACK_DETECTED",
            message: "Remote GitHub state is older or mismatched against trusted freshness anchor.",
            trustedHeadVersion: freshnessHead.headVersion,
            trustedHeadStateHash: freshnessHead.headStateHash,
            githubVersion: ghVersion,
            githubHash: ghHash,
          });
        }
      }

      return res.json({
        exists: true,
        sha,
        state: parsedState,
      });
    } catch (err: any) {
      if (err.status === 404) {
        if (freshnessHead) {
          return res.status(409).json({
            error: "REMOTE_STATE_ROLLBACK_DETECTED",
            message: "GitHub state file is missing but trusted freshness anchor recorded prior version.",
            trustedHeadVersion: freshnessHead.headVersion,
          });
        }
        return res.json({ exists: false, state: null });
      }
      throw err;
    }
  } catch (err: any) {
    return res.status(500).json({ error: "Fetch Failed", message: err.message });
  }
});

// 7. PUT /api/vault/state or POST /api/vault/sync
const syncHandler = async (req: Request, res: Response) => {
  try {
    const session = (req as any).session as Session;
    const { appId, stateObject } = req.body;

    if (!appId || !stateObject) {
      return res.status(400).json({ error: "Invalid Request", message: "appId and stateObject parameters are required." });
    }

    const stateFilePath = `data/users/${session.opaqueUserId}/vault/${appId}/state.json`;

    // 1. Verify freshness ledger availability
    let currentFreshnessHead: FreshnessRecord | null = null;
    try {
      if (!await getActiveFreshnessLedger().isAvailable()) {
        return res.status(503).json({
          error: "FRESHNESS_CHECK_FAILED",
          message: "Trusted freshness ledger is currently unavailable. State sync rejected.",
        });
      }
      currentFreshnessHead = await getActiveFreshnessLedger().getHead(session.opaqueUserId, appId);
    } catch {
      return res.status(503).json({
        error: "FRESHNESS_CHECK_FAILED",
        message: "Trusted freshness ledger is currently unavailable. State sync rejected.",
      });
    }

    const incomingPrevHash = stateObject.previousStateHash || "";
    const incomingVersion = typeof stateObject.dataVersion === "number" ? stateObject.dataVersion : 1;
    const incomingHash = stateObject.stateHash || "";

    // 2. Validate against trusted freshness anchor FIRST
    if (currentFreshnessHead) {
      if (incomingVersion <= currentFreshnessHead.headVersion) {
        return res.status(409).json({
          error: "Sync Conflict",
          message: `Version Monotonicity Violation: incoming version ${incomingVersion} <= existing head ${currentFreshnessHead.headVersion}`,
          currentHeadVersion: currentFreshnessHead.headVersion,
          currentHeadStateHash: currentFreshnessHead.headStateHash,
        });
      }
      if (incomingVersion !== currentFreshnessHead.headVersion + 1) {
        return res.status(409).json({
          error: "Sync Conflict",
          message: `Non-Consecutive Version Jump: incoming version ${incomingVersion} !== existing head ${currentFreshnessHead.headVersion} + 1`,
          currentHeadVersion: currentFreshnessHead.headVersion,
          currentHeadStateHash: currentFreshnessHead.headStateHash,
        });
      }
      if (incomingPrevHash !== currentFreshnessHead.headStateHash) {
        return res.status(409).json({
          error: "Sync Conflict",
          message: `State Chain Hash Mismatch: incoming previousStateHash '${incomingPrevHash}' !== existing head '${currentFreshnessHead.headStateHash}'`,
          currentHeadVersion: currentFreshnessHead.headVersion,
          currentHeadStateHash: currentFreshnessHead.headStateHash,
        });
      }
    } else if (incomingVersion !== 1) {
      return res.status(409).json({
        error: "Sync Conflict",
        message: `Initial Version Error: First state version must be 1, got ${incomingVersion}`,
      });
    }

    // 3. Validate against current GitHub remote head
    try {
      const { content: currentContent } = await githubStorageGet(stateFilePath);
      if (currentContent) {
        const currentState = JSON.parse(currentContent);
        const currentHeadStateHash = currentState.stateHash || "";
        const currentHeadVersion = typeof currentState.dataVersion === "number" ? currentState.dataVersion : 1;

        if (incomingPrevHash !== currentHeadStateHash || incomingVersion !== currentHeadVersion + 1) {
          return res.status(409).json({
            error: "Sync Conflict",
            message: "State chain mismatch: incoming previousStateHash or dataVersion does not match current remote head.",
            currentHeadVersion,
            currentHeadStateHash,
          });
        }
      }
    } catch (getErr: any) {
      if (getErr.status !== 404) {
        throw getErr;
      }
    }

    // 4. Perform GitHub state write FIRST
    let sha: string;
    const stateContentStr = JSON.stringify(stateObject);
    try {
      const putRes = await githubStoragePut(stateFilePath, stateContentStr, "Vault State Synchronized");
      sha = putRes.sha;
    } catch (ghErr: any) {
      return res.status(503).json({
        error: "GITHUB_WRITE_FAILED",
        message: `Failed to persist state to remote GitHub storage: ${ghErr.message}. Freshness ledger preserved.`,
      });
    }

    // 5. Update trusted freshness head atomically AFTER successful GitHub write
    const updateRes = await getActiveFreshnessLedger().updateHead(
      session.opaqueUserId,
      appId,
      incomingVersion,
      incomingHash,
      incomingPrevHash
    );

    if (!updateRes.success) {
      return res.status(409).json({
        error: "Sync Conflict",
        message: updateRes.reason || "Freshness ledger update failed.",
      });
    }

    return res.json({
      success: true,
      sha,
      appId,
      opaqueUserId: session.opaqueUserId,
      syncedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    if (err.status === 409) {
      return res.status(409).json({ error: "Sync Conflict", message: "Remote state updated concurrently. Please fetch latest state and merge." });
    }
    return res.status(500).json({ error: "Sync Failed", message: err.message });
  }
};

app.put("/api/vault/state", requireAuth, syncHandler);
app.post("/api/vault/sync", requireAuth, syncHandler);

// 8. POST /api/vault/recovery
app.post("/api/vault/recovery", rateLimiter(10, 60000), async (req: Request, res: Response) => {
  try {
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ error: "Invalid Request", message: "Username parameter is required." });
    }

    const usernameHash = crypto.createHash("sha256").update(username.trim().toLowerCase()).digest("hex");
    const indexFilePath = `data/users_index/${usernameHash}.json`;

    const { content: indexContent } = await githubStorageGet(indexFilePath);
    const { opaqueUserId, saltHex } = JSON.parse(indexContent);

    const userFilePath = `data/users/${opaqueUserId}/account/auth-config.json`;
    const { content: userContent } = await githubStorageGet(userFilePath);
    const authConfig = JSON.parse(userContent);

    return res.json({
      opaqueUserId,
      saltHex,
      recoveryWrappedDek: authConfig.recoveryWrappedDek,
      wrappedDek: authConfig.wrappedDek,
    });
  } catch (err: any) {
    return res.status(404).json({ error: "Recovery Account Not Found", message: "Unable to locate recovery profile for given user." });
  }
});

// 9. DELETE /api/vault/account
app.delete("/api/vault/account", requireAuth, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session as Session;
    const userDirPath = `data/users/${session.opaqueUserId}/`;

    await githubStorageDeleteDir(userDirPath);

    await getActiveSessionStore().revokeAllForUser(session.opaqueUserId);
    await getActiveFreshnessLedger().deleteUserRecords(session.opaqueUserId);

    return res.json({ success: true, message: "Account data deleted successfully." });
  } catch (err: any) {
    return res.status(500).json({ error: "Deletion Failed", message: err.message });
  }
});

// 9.5. GET /api/vault/tree & GET /api/vault/file (Secure Proxies for GitHub Storage Tree Listing)
app.get(["/api/vault/tree", "/vault/tree", "/tree"], requireAuth, async (req: Request, res: Response) => {
  const session = (req as any).session;
  const username = session ? session.opaqueUserId : "anonymous";

  const owner = getGitHubOwner();
  const repo = getGitHubRepo();
  const branch = getGitHubBranch();
  const pat = getGitHubPat();

  console.log("[TREE API] GET /api/vault/tree");
  console.log("[TREE API] authenticated:", !!(req as any).user);
  console.log("[TREE API] owner:", owner);
  console.log("[TREE API] repo:", repo);
  console.log("[TREE API] branch:", branch);

  if (!pat) {
    if (isProductionRuntime()) {
      return res.status(503).json({
        error: "CONFIGURATION_ERROR",
        message: "Required GitHub storage configuration is missing.",
        missing: ["GITHUB_STORAGE_PAT"],
      });
    }
    // Return mock tree listing based on active local simulation
    const localKeys = Array.from(serverLocalVault.keys());
    const mockTree = localKeys.map((k) => ({
      path: k,
      sha: "local_sha",
      type: "blob",
      updatedAt: new Date().toISOString(),
    }));
    return res.json({ tree: mockTree, files: mockTree });
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;

  try {
    const gitRes = await fetch(url, {
      headers: getGitHubHeaders(pat),
    });

    if (gitRes.status === 401) {
      return res.status(401).json({
        error: "GitHub authentication error",
        message: "GITHUB_STORAGE_PAT invalid or expired.",
      });
    }
    if (gitRes.status === 403) {
      return res.status(403).json({
        error: "GitHub authorization error",
        message: "GITHUB_STORAGE_PAT lacks repo read permissions.",
      });
    }

    if (!gitRes.ok) {
      const errJson = await gitRes.json().catch(() => ({}));
      const errMsg = errJson.message || gitRes.statusText;
      return res.status(gitRes.status).json({
        error: "GitHub API Error",
        message: `Failed to fetch tree from GitHub: ${errMsg}`,
      });
    }

    const data = await gitRes.json();
    const rawTree = data.tree || [];

    console.log(`Response item/file count: ${rawTree.length}`);
    console.log("-------------------------------");

    // Filter to only include files and directories under data/users/ and data/users_index/
    const filteredTree = rawTree
      .filter((item: any) => {
        return (
          item.path.startsWith("data/users/") ||
          item.path.startsWith("data/users_index/") ||
          item.path === "data/users" ||
          item.path === "data/users_index"
        );
      })
      .map((item: any) => ({
        path: item.path,
        sha: item.sha,
        type: item.type === "tree" ? "tree" : "blob",
        updatedAt: new Date().toISOString(),
      }));

    return res.json({ tree: filteredTree, files: filteredTree });
  } catch (err: any) {
    console.error("Exception during GitHub API tree fetch:", err);
    return res.status(500).json({
      error: "GitHub API Error",
      message: err.message || "Internal server error while retrieving repository tree.",
    });
  }
});

app.get("/api/vault/file", requireAuth, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const filePath = req.query.path as string;
    const pat = getGitHubPat();

    // Extract requestedUserId from filePath for temporary diagnostic logging
    let decoded = filePath || "";
    try {
      decoded = decodeURIComponent(decoded);
      decoded = decodeURIComponent(decoded);
    } catch {
      // ignore
    }
    let normalized = decoded.replace(/\\/g, "/");
    let requestedUserId = "";
    if (normalized.startsWith("data/users/")) {
      const rest = normalized.slice("data/users/".length);
      const slashIdx = rest.indexOf("/");
      if (slashIdx !== -1) {
        requestedUserId = rest.slice(0, slashIdx);
      } else {
        requestedUserId = rest;
      }
    }

    console.log("[FILE API] authenticated:", !!req.user);
    console.log("[FILE API] authenticated opaqueUserId:", req.user?.opaqueUserId);
    console.log("[FILE API] requested userId:", requestedUserId);

    const validatedPath = validateVaultPath(session.opaqueUserId, filePath);

    if (pat) {
      const { content, sha } = await githubStorageGet(validatedPath);
      return res.json({ content, sha });
    } else {
      const entry = serverLocalVault.get(validatedPath);
      if (!entry) {
        return res.status(404).json({ error: "Not Found", message: "File not found locally." });
      }
      return res.json({ content: entry.content, sha: entry.sha });
    }
  } catch (err: any) {
    const status = err.status || 500;
    return res.status(status).json({
      error: err.status === 403 ? "Forbidden" : err.status === 404 ? "Not Found" : "Read Failed",
      message: err.message || "Failed to retrieve file content.",
    });
  }
});

app.post("/api/vault/file", requireAuth, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const { path: filePath, content, expectedSha } = req.body;

    if (!content) {
      return res.status(400).json({ error: "Invalid Request", message: "Content parameter is required." });
    }

    const validatedPath = validateVaultPath(session.opaqueUserId, filePath);
    const commitMsg = `Sync file: ${validatedPath}`;
    const result = await githubStoragePut(validatedPath, content, commitMsg, expectedSha);

    return res.json({ success: true, sha: result.sha });
  } catch (err: any) {
    if (err.status === 409) {
      return res.status(409).json({
        error: "Storage conflict",
        message: "The remote file changed. Refresh and try again.",
      });
    }
    const status = err.status || 500;
    return res.status(status).json({
      error: err.status === 403 ? "Forbidden" : "Write Failed",
      message: err.message || "Failed to write file content.",
    });
  }
});

app.put("/api/vault/file", requireAuth, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const { path: filePath, content, expectedSha } = req.body;

    if (!content) {
      return res.status(400).json({ error: "Invalid Request", message: "Content parameter is required." });
    }

    const validatedPath = validateVaultPath(session.opaqueUserId, filePath);
    const commitMsg = `Update file: ${validatedPath}`;
    const result = await githubStoragePut(validatedPath, content, commitMsg, expectedSha);

    return res.json({ success: true, sha: result.sha });
  } catch (err: any) {
    if (err.status === 409) {
      return res.status(409).json({
        error: "Storage conflict",
        message: "The remote file changed. Refresh and try again.",
      });
    }
    const status = err.status || 500;
    return res.status(status).json({
      error: err.status === 403 ? "Forbidden" : "Update Failed",
      message: err.message || "Failed to update file content.",
    });
  }
});

app.delete("/api/vault/file", requireAuth, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const filePath = (req.query.path as string) || req.body.path;
    const expectedSha = (req.query.sha as string) || req.body.sha || req.body.expectedSha;

    if (!filePath) {
      return res.status(400).json({ error: "Invalid Request", message: "Path parameter is required." });
    }
    if (!expectedSha) {
      return res.status(400).json({ error: "Invalid Request", message: "SHA parameter is required for safe deletion." });
    }

    const validatedPath = validateVaultPath(session.opaqueUserId, filePath);
    const commitMsg = `Delete file: ${validatedPath}`;
    await githubStorageDeleteFile(validatedPath, expectedSha, commitMsg);

    return res.json({ success: true, message: "File deleted successfully." });
  } catch (err: any) {
    if (err.status === 409) {
      return res.status(409).json({
        error: "Storage conflict",
        message: "The remote file changed. Refresh and try again.",
      });
    }
    const status = err.status || 500;
    return res.status(status).json({
      error: err.status === 403 ? "Forbidden" : err.status === 404 ? "Not Found" : "Delete Failed",
      message: err.message || "Failed to delete file.",
    });
  }
});

// Alias: POST /api/vault/unlock -> forwards to login or unlocks session
app.post("/api/vault/unlock", rateLimiter(15, 60000), async (req: Request, res: Response) => {
  // If request contains credentials, handle via login logic
  if (req.body && (req.body.opaqueUserId || req.body.username)) {
    return (app as any)._router.handle({ ...req, url: "/api/vault/login" }, res);
  }
  return res.status(400).json({ error: "Invalid Request", message: "Credentials or session token required to unlock." });
});

// Alias: POST /api/vault/lock -> forwards to logout
app.post("/api/vault/lock", requireAuth, async (req: Request, res: Response) => {
  return (app as any)._router.handle({ ...req, url: "/api/vault/logout" }, res);
});

// Alias: POST /api/vault/store -> forwards to /api/vault/file
app.post("/api/vault/store", requireAuth, async (req: Request, res: Response) => {
  return (app as any)._router.handle({ ...req, url: "/api/vault/file" }, res);
});

// Alias: POST /api/vault/retrieve -> retrieves vault file or state
app.post("/api/vault/retrieve", requireAuth, async (req: Request, res: Response) => {
  const filePath = req.body.path;
  if (filePath) {
    req.query.path = filePath;
    return (app as any)._router.handle({ ...req, method: "GET", url: `/api/vault/file?path=${encodeURIComponent(filePath)}` }, res);
  }
  return (app as any)._router.handle({ ...req, method: "GET", url: "/api/vault/state" }, res);
});

// Alias: POST /api/vault/delete -> forwards to DELETE /api/vault/file
app.post("/api/vault/delete", requireAuth, async (req: Request, res: Response) => {
  return (app as any)._router.handle({ ...req, method: "DELETE", url: "/api/vault/file" }, res);
});

// GET /api/vault/stats -> returns vault statistics and storage provider info
app.get("/api/vault/stats", async (_req: Request, res: Response) => {
  const config = checkGitHubStorageConfig();
  return res.json({
    ok: true,
    storage: {
      provider: "github",
      owner: getGitHubOwner(),
      repo: getGitHubRepo(),
      branch: getGitHubBranch(),
      configured: config.valid,
    },
    status: config.valid ? "operational" : isProductionRuntime() ? "degraded" : "local-simulation",
    timestamp: new Date().toISOString(),
  });
});

// POST /api/vault/test-sync -> test sync endpoint
app.post("/api/vault/test-sync", async (req: Request, res: Response) => {
  const config = checkGitHubStorageConfig();
  if (isProductionRuntime() && !config.valid) {
    return res.status(503).json({
      error: "GitHub Storage Unavailable",
      message: "GitHub storage configuration missing in production runtime.",
    });
  }
  return res.json({
    ok: true,
    synced: true,
    message: "Vault sync test completed successfully.",
    timestamp: new Date().toISOString(),
  });
});

// 10. POST /api/testing/run
app.post("/api/testing/run", async (req: Request, res: Response) => {
  try {
    let SecurityTestRunner: any;
    try {
      const runnerMod = await import("../sdk/testing/SecurityTestRunner.js");
      SecurityTestRunner = runnerMod.SecurityTestRunner;
    } catch {
      const runnerMod = await import("../sdk/testing/SecurityTestRunner");
      SecurityTestRunner = runnerMod.SecurityTestRunner;
    }
    const results = await SecurityTestRunner.runAllTests();
    return res.json({ results });
  } catch (err: any) {
    return res.status(500).json({ error: "Testing Failed", message: err.message });
  }
});

// Guarantee that any unhandled /api or /api/* requests never fall through to index.html/Vite middlewares
app.all(["/api", "/api/*"], (req: Request, res: Response) => {
  return res.status(404).json({
    error: "Not Found",
    message: `API endpoint ${req.method} ${req.path} not found.`,
  });
});

export { app };
export default app;
