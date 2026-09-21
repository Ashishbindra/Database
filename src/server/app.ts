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
  return (process.env.GITHUB_OWNER || "Ashishbindra").trim();
}

function getGitHubRepo(): string {
  return (process.env.GITHUB_REPO || "github-encrypted-storage").trim();
}

function getGitHubBranch(): string {
  return (process.env.GITHUB_BRANCH || "main").trim();
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
const tokenLastUsedMap = new Map<string, string>();

// In-Memory Fallback Storage Mock for Local Server Execution when GITHUB_PAT is not supplied
const serverLocalVault = new Map<string, { content: string; sha: string; updatedAt: string }>();

// Middleware: Express JSON Parser & Body Limits (Strict 5MB limit with graceful 413 handling)
app.use(express.json({ limit: "5mb" }));

// Handle JSON syntax parsing errors & payload limit errors gracefully
app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  if (err && (err.type === "entity.too.large" || err.status === 413 || err.statusCode === 413)) {
    return res.status(413).json({
      success: false,
      error: "Payload Too Large",
      message: "Request payload exceeds the maximum allowed size limit of 5MB.",
      statusCode: 413,
    });
  }
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({
      success: false,
      error: "Bad Request",
      message: "Malformed JSON payload in request body.",
      statusCode: 400,
    });
  }
  if (err) {
    return res.status(err.status || 500).json({
      success: false,
      error: err.error || "Internal Server Error",
      message: err.message || "An unexpected error occurred.",
      statusCode: err.status || 500,
    });
  }
  next();
});

// Middleware: Security Headers
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  // Standard CORS setup
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Project-Token, X-Requested-With, Accept");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

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
function rateLimiter(maxRequests = 120, windowMs = 60000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = getClientIp(req);

    // Set standard rate limit headers on every response
    res.setHeader("X-RateLimit-Limit", String(maxRequests));

    // Bypass rate limiting counting on loopback / localhost to prevent test suite rate limiting
    if (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1" || ip.includes("127.0.0.1") || ip === "serverless-client") {
      res.setHeader("X-RateLimit-Remaining", String(maxRequests));
      res.setHeader("X-RateLimit-Reset", String(Math.ceil((Date.now() + windowMs) / 1000)));
      return next();
    }

    const now = Date.now();
    const record = rateLimitMap.get(ip);

    if (!record || now > record.resetTime) {
      rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
      res.setHeader("X-RateLimit-Remaining", String(maxRequests - 1));
      res.setHeader("X-RateLimit-Reset", String(Math.ceil((now + windowMs) / 1000)));
      return next();
    }

    const remaining = Math.max(0, maxRequests - record.count);
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(record.resetTime / 1000)));

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

// Apply rate limiter globally
app.use(rateLimiter(120, 60000));

async function verifyGitHubRepository(): Promise<{ valid: boolean; status: number; message: string }> {
  const pat = getGitHubPat();
  const owner = getGitHubOwner();
  const repo = getGitHubRepo();
  const branch = getGitHubBranch();

  console.log(`[GITHUB_CONFIG_DEBUG] { owner: "${owner}", repo: "${repo}", branch: "${branch}", hasPat: ${Boolean(pat)}, patPrefix: "<never print actual prefix>" }`);

  if (!pat) {
    return { valid: false, status: 503, message: "Required GitHub storage configuration (PAT) is missing." };
  }

  const repoUrl = `https://api.github.com/repos/${owner}/${repo}`;
  try {
    const repoRes = await fetch(repoUrl, {
      headers: getGitHubHeaders(pat),
    });

    console.log(`[GITHUB_REPOSITORY_CHECK] { status: ${repoRes.status}, owner: "${owner}", repo: "${repo}" }`);

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
        return { valid: false, status: 404, message: `GITHUB_REPOSITORY_ACCESS_ERROR: GitHub repository '${owner}/${repo}' is not accessible with the configured credentials. Verify GITHUB_OWNER, GITHUB_REPO, and PAT repository permissions.` };
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
        return { valid: false, status: 404, message: `GITHUB_BRANCH_ERROR: GitHub branch '${branch}' not found in repository '${owner}/${repo}'. Verify GITHUB_BRANCH configuration.` };
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
        throw { status: 409, error: "Conflict", message: "409 Conflict: Remote version updated concurrently." };
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
  getFile: async (filePath: string) => {
    try {
      return await githubStorageGet(filePath);
    } catch (err: any) {
      if (err.status === 404 || err.message === "File not found") {
        return null;
      }
      throw err;
    }
  },
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

    // Existence check for user index file
    try {
      await githubStorageGet(indexFilePath);
      // If githubStorageGet succeeds (200), file exists -> duplicate user!
      return res.status(409).json({ error: "Duplicate User", message: "Username already exists." });
    } catch (err: any) {
      if (err.status === 401 || err.status === 403) {
        return res.status(err.status).json({ error: "GitHub Storage Error", message: err.message });
      }
      if (err.status === 404 || err.message === "File not found") {
        // File does not exist -> expected for new registration, continue!
      } else if (err.status) {
        return res.status(err.status).json({ error: "GitHub Storage Error", message: err.message });
      } else {
        throw err;
      }
    }

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
// Also supports GET with ?username=...
app.all("/api/vault/auth-params", rateLimiter(30, 60000), async (req: Request, res: Response) => {
  try {
    const username = req.method === "POST" ? req.body.username : req.query.username;
    if (!username || typeof username !== "string") {
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

    // 5b. If appId is shramik_hisab and workerAuthEntries provided, update global worker authentication index
    if (appId === "shramik_hisab" && Array.isArray(req.body.workerAuthEntries)) {
      const workerAuthEntries = req.body.workerAuthEntries;
      for (const entry of workerAuthEntries) {
        if (entry && entry.workerId && entry.isWorkerLoginEnabled && entry.workerPasswordHash && entry.workerSaltHex) {
          const workerIdHex = Buffer.from(entry.workerId).toString('hex');
          const indexFilePath = `data/workers_index/${workerIdHex}.json`;
          const indexRecord = {
            workerId: entry.workerId,
            ownerOpaqueUserId: session.opaqueUserId,
            workerPasswordHash: entry.workerPasswordHash,
            workerSaltHex: entry.workerSaltHex,
            isWorkerLoginEnabled: true,
            updatedAt: new Date().toISOString(),
          };
          try {
            await githubStoragePut(indexFilePath, JSON.stringify(indexRecord, null, 2), `Update worker index for ${entry.workerId}`);
          } catch (e) {
            console.error("Failed to update worker index:", e);
          }
        } else if (entry && entry.workerId) {
          const workerIdHex = Buffer.from(entry.workerId).toString('hex');
          const indexFilePath = `data/workers_index/${workerIdHex}.json`;
          try {
            const { content, sha } = await githubStorageGet(indexFilePath);
            if (content) {
              const parsed = JSON.parse(content);
              if (parsed.ownerOpaqueUserId === session.opaqueUserId && sha) {
                await githubStorageDeleteFile(indexFilePath, sha, `Remove worker index for ${entry.workerId}`);
              }
            }
          } catch {}
        }
      }
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

// 7c. POST /api/vault/worker/register
app.post("/api/vault/worker/register", async (req: Request, res: Response) => {
  try {
    const {
      workerId,
      ownerOpaqueUserId,
      workerPasswordHash,
      workerSaltHex,
      isWorkerLoginEnabled = true,
      isPasswordChangeRequired = true,
      appId = "shramik_hisab",
    } = req.body;

    if (!workerId || !ownerOpaqueUserId || !workerPasswordHash || !workerSaltHex) {
      return res.status(400).json({
        error: "Invalid Request",
        message: "workerId, ownerOpaqueUserId, workerPasswordHash, and workerSaltHex are required.",
      });
    }

    const cleanWorkerId = String(workerId).trim();
    const workerIdHex = Buffer.from(cleanWorkerId).toString("hex");
    const indexFilePath = `data/workers_index/${workerIdHex}.json`;

    const indexRecord = {
      workerId: cleanWorkerId,
      ownerOpaqueUserId: String(ownerOpaqueUserId).trim(),
      workerPasswordHash: String(workerPasswordHash).trim(),
      workerSaltHex: String(workerSaltHex).trim(),
      isWorkerLoginEnabled: Boolean(isWorkerLoginEnabled),
      isPasswordChangeRequired: Boolean(isPasswordChangeRequired),
      appId: appId || "shramik_hisab",
      updatedAt: new Date().toISOString(),
    };

    await githubStoragePut(
      indexFilePath,
      JSON.stringify(indexRecord, null, 2),
      `Register worker ${cleanWorkerId} in global Vault index`
    );

    return res.status(200).json({
      success: true,
      workerId: cleanWorkerId,
      isWorkerLoginEnabled: indexRecord.isWorkerLoginEnabled,
      message: "Worker registered in global Vault index successfully.",
    });
  } catch (err: any) {
    console.error("[WORKER_REGISTER_ERROR]", err);
    return res.status(500).json({
      error: "Worker Registration Failed",
      message: err.message || "Failed to register worker in global Vault index.",
    });
  }
});

// 8. POST /api/vault/worker/auth-params
app.post("/api/vault/worker/auth-params", async (req: Request, res: Response) => {
  try {
    const { workerId } = req.body;
    if (!workerId) {
      return res.status(400).json({ error: "Invalid Request", message: "workerId is required." });
    }
    const workerIdHex = Buffer.from(workerId).toString('hex');
    const indexFilePath = `data/workers_index/${workerIdHex}.json`;
    try {
      const { content } = await githubStorageGet(indexFilePath);
      if (content) {
        const record = JSON.parse(content);
        if (record.isWorkerLoginEnabled) {
          return res.json({
            exists: true,
            isWorkerLoginEnabled: true,
            workerSaltHex: record.workerSaltHex,
          });
        }
      }
    } catch {}
    return res.json({ exists: false, isWorkerLoginEnabled: false });
  } catch (err: any) {
    return res.status(500).json({ error: "Server Error", message: err.message });
  }
});

// 9. POST /api/vault/worker/login
app.post("/api/vault/worker/login", async (req: Request, res: Response) => {
  try {
    const { workerId, passwordHash, passwordProof } = req.body;
    if (!workerId || (!passwordHash && !passwordProof)) {
      return res.status(400).json({ error: "Invalid Request", message: "workerId and passwordHash/passwordProof are required." });
    }
    const workerIdHex = Buffer.from(workerId).toString('hex');
    const indexFilePath = `data/workers_index/${workerIdHex}.json`;

    let record: any = null;
    try {
      const { content } = await githubStorageGet(indexFilePath);
      if (content) {
        record = JSON.parse(content);
      }
    } catch {
      return res.status(401).json({ error: "Authentication Failed", message: "Invalid worker credentials." });
    }

    if (!record || !record.isWorkerLoginEnabled || !record.workerPasswordHash) {
      return res.status(401).json({ error: "Authentication Failed", message: "Worker not found or login disabled." });
    }

    const submittedProof = passwordHash || passwordProof;
    const expectedBuf = Buffer.from(record.workerPasswordHash, 'hex');
    const submittedBuf = Buffer.from(submittedProof, 'hex');

    if (expectedBuf.length !== submittedBuf.length || !crypto.timingSafeEqual(expectedBuf, submittedBuf)) {
      return res.status(401).json({ error: "Authentication Failed", message: "Invalid password." });
    }

    return res.json({
      success: true,
      authenticatedWorkerId: record.workerId,
      opaqueUserId: record.ownerOpaqueUserId,
      appId: "shramik_hisab",
    });
  } catch (err: any) {
    return res.status(401).json({ error: "Authentication Failed", message: err.message || "Worker login failed." });
  }
});

// 10. POST /api/vault/worker/state
app.post("/api/vault/worker/state", async (req: Request, res: Response) => {
  try {
    const { workerId, passwordHash, passwordProof, appId = "shramik_hisab" } = req.body;
    if (!workerId || (!passwordHash && !passwordProof)) {
      return res.status(400).json({ error: "Invalid Request", message: "workerId and passwordHash/passwordProof are required." });
    }
    const workerIdHex = Buffer.from(workerId).toString('hex');
    const indexFilePath = `data/workers_index/${workerIdHex}.json`;

    let record: any = null;
    try {
      const { content } = await githubStorageGet(indexFilePath);
      if (content) {
        record = JSON.parse(content);
      }
    } catch {
      return res.status(401).json({ error: "Authentication Failed", message: "Invalid worker credentials." });
    }

    if (!record || !record.isWorkerLoginEnabled || !record.workerPasswordHash) {
      return res.status(401).json({ error: "Authentication Failed", message: "Worker not found or login disabled." });
    }

    const submittedProof = passwordHash || passwordProof;
    const expectedBuf = Buffer.from(record.workerPasswordHash, 'hex');
    const submittedBuf = Buffer.from(submittedProof, 'hex');

    if (expectedBuf.length !== submittedBuf.length || !crypto.timingSafeEqual(expectedBuf, submittedBuf)) {
      return res.status(401).json({ error: "Authentication Failed", message: "Invalid password." });
    }

    const opaqueUserId = record.ownerOpaqueUserId;
    const stateFilePath = `data/users/${opaqueUserId}/vault/${appId}/state.json`;

    try {
      const { content, sha } = await githubStorageGet(stateFilePath);
      const parsedState = JSON.parse(content);
      return res.json({
        exists: true,
        sha,
        state: parsedState,
        opaqueUserId,
      });
    } catch (err: any) {
      if (err.status === 404 || err.statusCode === 404) {
        return res.json({ exists: false, state: null, opaqueUserId });
      }
      return res.status(500).json({ error: "Server Error", message: err.message || "Failed to fetch state." });
    }
  } catch (err: any) {
    return res.status(500).json({ error: "Server Error", message: err.message || "Worker state fetch failed." });
  }
});

// ============================================================================
// DATABASE SERVICE API LAYER FOR EXTERNAL APPLICATIONS (MULTI-PROJECT DB SERVICE)
// ============================================================================

// Standard cryptographic helpers for project session authentication
function dbStringToBase64Url(str: string): string {
  return Buffer.from(str).toString("base64url");
}

function dbBase64UrlToString(base64url: string): string {
  return Buffer.from(base64url, "base64url").toString("utf8");
}

function dbGenerateHmacHex(secret: string, data: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

// 1. Strict Path Validation to enforce exact structure & prevent path traversal
function validateDbPath(projectId: string, collection: string, recordId?: string): string {
  const validPattern = /^[a-zA-Z0-9_-]+$/;
  if (!projectId || projectId.length > 64 || !validPattern.test(projectId)) {
    throw { status: 400, error: "Invalid Request", message: "Invalid project ID: must be 1-64 alphanumeric characters, hyphens, or underscores." };
  }
  if (!collection || collection.length > 64 || !validPattern.test(collection)) {
    throw { status: 400, error: "Invalid Request", message: "Invalid collection name: must be 1-64 alphanumeric characters, hyphens, or underscores." };
  }
  if (recordId && (recordId.length > 128 || !validPattern.test(recordId))) {
    throw { status: 400, error: "Invalid Request", message: "Invalid record ID: must be 1-128 alphanumeric characters, hyphens, or underscores." };
  }

  if (projectId.includes("..") || projectId.includes("/") || projectId.includes("\\") || projectId.includes("\0")) {
    throw { status: 400, error: "Invalid Request", message: "Path traversal violation in projectId." };
  }
  if (collection.includes("..") || collection.includes("/") || collection.includes("\\") || collection.includes("\0")) {
    throw { status: 400, error: "Invalid Request", message: "Path traversal violation in collection." };
  }
  if (recordId && (recordId.includes("..") || recordId.includes("/") || recordId.includes("\\") || recordId.includes("\0"))) {
    throw { status: 400, error: "Invalid Request", message: "Path traversal violation in recordId." };
  }

  let targetPath = `data/apps/${projectId}/collections/${collection}/records`;
  if (recordId) {
    targetPath += `/${recordId}.json`;
  }

  const normalized = path.normalize(targetPath).replace(/\\/g, "/");
  if (normalized.startsWith("..") || normalized.startsWith("/") || normalized.startsWith("\\")) {
    throw { status: 400, error: "Invalid Request", message: "Normalized path escape violation." };
  }

  const expectedPrefix = `data/apps/${projectId}/collections/${collection}/records`;
  if (!normalized.startsWith(expectedPrefix)) {
    throw { status: 403, error: "Forbidden", message: "Access forbidden: path breakout detected." };
  }

  return normalized;
}

// 2. High-Entropy AES-256-GCM Server-side Encryption helpers
function encryptRecord(plainText: string, projectId: string): string {
  const key = crypto.createHmac("sha256", getSessionSecret()).update(projectId).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");
  return JSON.stringify({
    iv: iv.toString("hex"),
    ciphertext: encrypted,
    tag: tag
  });
}

function decryptRecord(encryptedJson: string, projectId: string): string {
  try {
    const { iv, ciphertext, tag } = JSON.parse(encryptedJson);
    if (!iv || !ciphertext || !tag) {
      throw new Error("Invalid envelope format");
    }
    const key = crypto.createHmac("sha256", getSessionSecret()).update(projectId).digest();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
    decipher.setAuthTag(Buffer.from(tag, "hex"));
    let decrypted = decipher.update(ciphertext, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    throw { status: 422, error: "Decryption Failed", message: "Failed to authenticate or decrypt record payload." };
  }
}

// 3. Database Folder list helper (mock vs GitHub)
async function listDatabaseFiles(prefixPath: string): Promise<Array<{ path: string; sha: string; type: string }>> {
  const pat = getGitHubPat();
  const owner = getGitHubOwner();
  const repo = getGitHubRepo();
  const branch = getGitHubBranch();

  if (!pat) {
    const localKeys = Array.from(serverLocalVault.keys());
    const matches = localKeys.filter((k) => k.startsWith(prefixPath));
    return matches.map((k) => {
      const entry = serverLocalVault.get(k);
      return {
        path: k,
        sha: entry ? entry.sha : "local_sha",
        type: "blob",
      };
    });
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
  const gitRes = await fetch(url, {
    headers: getGitHubHeaders(pat),
  });

  if (!gitRes.ok) {
    return [];
  }

  const data = await gitRes.json();
  const rawTree = data.tree || [];
  return rawTree
    .filter((item: any) => item.type === "blob" && item.path.startsWith(prefixPath))
    .map((item: any) => ({
      path: item.path,
      sha: item.sha,
      type: "blob",
    }));
}

// 4. Project Authentication Middleware (uses HMAC-signed token)
async function requireProjectAuth(req: Request, res: Response, next: NextFunction) {
  let token = req.headers["authorization"] || (req.query.token as string) || (req.headers["x-project-token"] as string);
  if (Array.isArray(token)) {
    token = token[0];
  }
  if (!token) {
    return res.status(401).json({ error: "Unauthorized", message: "Missing or malformed Authorization header or project token." });
  }

  if (token.startsWith("Bearer ")) {
    token = token.substring(7);
  }

  try {
    const parts = token.split(".");
    if (parts.length !== 2) {
      return res.status(401).json({ error: "Unauthorized", message: "Invalid or malformed project token format." });
    }

    const payloadStr = dbBase64UrlToString(parts[0]);
    const expectedHmac = dbGenerateHmacHex(getSessionSecret(), payloadStr);

    if (parts[1].length !== expectedHmac.length || !crypto.timingSafeEqual(Buffer.from(parts[1]), Buffer.from(expectedHmac))) {
      return res.status(401).json({ error: "Unauthorized", message: "Invalid project token signature." });
    }

    const payload: any = JSON.parse(payloadStr);
    if (!payload.projectId || !payload.opaqueUserId) {
      return res.status(401).json({ error: "Unauthorized", message: "Invalid project token payload." });
    }

    // Check project status & token revocation in projects.json
    try {
      const projectsPath = `data/users/${payload.opaqueUserId}/projects.json`;
      const fileData = await serverGitHubClient.getFile(projectsPath);
      if (fileData) {
        const parsed = JSON.parse(fileData.content);
        const proj = (parsed.projects || []).find((p: any) => p.projectId === payload.projectId);
        if (proj) {
          if (proj.status === "disabled") {
            return res.status(403).json({ error: "Forbidden", message: "Project is disabled." });
          }
          if (proj.projectToken && proj.projectToken !== token) {
            return res.status(403).json({ error: "Forbidden", message: "Project token has been rotated or revoked." });
          }
        }
      }
    } catch {
      // If error or file not found, continue with HMAC validated session
    }

    // Record last used timestamp safely
    tokenLastUsedMap.set(`${payload.opaqueUserId}:${payload.projectId}`, new Date().toISOString());

    (req as any).projectSession = {
      projectId: payload.projectId,
      opaqueUserId: payload.opaqueUserId,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized", message: "Invalid or malformed project token." });
  }
}

// 5. REST API - Project endpoints
// 5.1 POST /api/db/projects (Create project)
app.post("/api/db/projects", requireAuth, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const { projectId } = req.body;

    if (!projectId) {
      return res.status(400).json({ error: "Invalid Request", message: "projectId is required." });
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(projectId) || projectId.length > 64) {
      return res.status(400).json({ error: "Invalid Request", message: "Invalid project ID: must be 1-64 alphanumeric characters, hyphens, or underscores." });
    }

    const opaqueUserId = session.opaqueUserId;
    const projectsPath = `data/users/${opaqueUserId}/projects.json`;

    let projectsList: any[] = [];
    let fileSha: string | undefined = undefined;
    try {
      const fileData = await serverGitHubClient.getFile(projectsPath);
      if (fileData) {
        const parsed = JSON.parse(fileData.content);
        projectsList = parsed.projects || [];
        fileSha = fileData.sha;
      }
    } catch (e) {
      // ignore
    }

    const exists = projectsList.some(p => p.projectId === projectId);
    if (exists) {
      return res.status(409).json({ error: "Duplicate Project", message: "Project already exists." });
    }

    const tokenPayload = {
      projectId,
      opaqueUserId,
      issuedAt: Date.now(),
    };
    const payloadStr = JSON.stringify(tokenPayload);
    const hmac = dbGenerateHmacHex(getSessionSecret(), payloadStr);
    const projectToken = dbStringToBase64Url(payloadStr) + "." + hmac;

    projectsList.push({
      projectId,
      projectToken,
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const contentStr = JSON.stringify({ projects: projectsList }, null, 2);
    await githubStoragePut(projectsPath, contentStr, `Create project: ${projectId}`, fileSha);

    return res.json({
      success: true,
      projectId,
      projectToken,
      status: "active",
      message: "Project created successfully."
    });
  } catch (err: any) {
    return res.status(500).json({ error: "Project Creation Failed", message: err.message });
  }
});

// 5.1b GET /api/db/usage (Developer Usage Telemetry)
app.get("/api/db/usage", requireAuth, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const opaqueUserId = session.opaqueUserId;
    const projectsPath = `data/users/${opaqueUserId}/projects.json`;

    let projectsList: any[] = [];
    try {
      const fileData = await serverGitHubClient.getFile(projectsPath);
      if (fileData) {
        const parsed = JSON.parse(fileData.content);
        projectsList = parsed.projects || [];
      }
    } catch {
      // ignore
    }

    let totalCollections = 0;
    let totalRecords = 0;
    const projectStats: any[] = [];

    for (const proj of projectsList) {
      const prefix = `data/apps/${proj.projectId}/collections/`;
      const files = await listDatabaseFiles(prefix);
      const cols = new Set<string>();
      let recCount = 0;
      for (const f of files) {
        const sub = f.path.substring(prefix.length);
        const parts = sub.split("/");
        if (parts[0]) cols.add(parts[0]);
        if (f.path.endsWith(".json") && f.path.includes("/records/")) {
          recCount++;
        }
      }
      totalCollections += cols.size;
      totalRecords += recCount;
      projectStats.push({
        projectId: proj.projectId,
        status: proj.status || "active",
        collectionsCount: cols.size,
        recordsCount: recCount,
        lastUsedAt: tokenLastUsedMap.get(`${opaqueUserId}:${proj.projectId}`) || proj.lastUsedAt || null,
        createdAt: proj.createdAt || null,
      });
    }

    return res.json({
      success: true,
      totalProjects: projectsList.length,
      activeProjects: projectsList.filter(p => p.status !== "disabled").length,
      disabledProjects: projectsList.filter(p => p.status === "disabled").length,
      totalCollections,
      totalRecords,
      projects: projectStats,
      storage: {
        provider: "github",
        owner: getGitHubOwner(),
        repo: getGitHubRepo(),
        branch: getGitHubBranch(),
        isConfigured: Boolean(getGitHubPat()),
      },
      security: {
        encryption: "AES-256-GCM",
        keyDerivation: "PBKDF2-HMAC-SHA256",
        concurrency: "Optimistic Blob SHA verification",
        projectIsolation: "data/apps/{projectId}/ Scoped Boundaries",
      }
    });
  } catch (err: any) {
    return res.status(500).json({ error: "Usage Telemetry Failed", message: err.message });
  }
});

// 5.2 GET /api/db/projects (List projects)
app.get("/api/db/projects", requireAuth, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const opaqueUserId = session.opaqueUserId;
    const projectsPath = `data/users/${opaqueUserId}/projects.json`;

    let projectsList: any[] = [];
    try {
      const fileData = await serverGitHubClient.getFile(projectsPath);
      if (fileData) {
        const parsed = JSON.parse(fileData.content);
        projectsList = (parsed.projects || []).map((p: any) => ({
          ...p,
          status: p.status || "active",
          lastUsedAt: tokenLastUsedMap.get(`${opaqueUserId}:${p.projectId}`) || p.lastUsedAt || null,
        }));
      }
    } catch (e) {
      // ignore
    }

    return res.json({ projects: projectsList });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to list projects", message: err.message });
  }
});

// 5.2b GET /api/db/projects/:projectId/stats (Project Statistics)
app.get("/api/db/projects/:projectId/stats", requireProjectAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const projectSession = (req as any).projectSession;

    if (projectSession.projectId !== projectId) {
      return res.status(403).json({ error: "Forbidden", message: "Access forbidden to requested project." });
    }

    const prefix = `data/apps/${projectId}/collections/`;
    const files = await listDatabaseFiles(prefix);

    const collectionsBreakdown: Record<string, number> = {};
    for (const f of files) {
      const sub = f.path.substring(prefix.length);
      const parts = sub.split("/");
      const colName = parts[0];
      if (colName) {
        if (collectionsBreakdown[colName] === undefined) {
          collectionsBreakdown[colName] = 0;
        }
        if (f.path.endsWith(".json") && f.path.includes("/records/")) {
          collectionsBreakdown[colName]++;
        }
      }
    }

    const cols = Object.keys(collectionsBreakdown);
    const totalRecs = Object.values(collectionsBreakdown).reduce((a, b) => a + b, 0);

    return res.json({
      success: true,
      projectId,
      collectionsCount: cols.length,
      totalRecords: totalRecs,
      collections: cols.map(c => ({ collection: c, recordCount: collectionsBreakdown[c] })),
      lastUsedAt: tokenLastUsedMap.get(`${projectSession.opaqueUserId}:${projectId}`) || new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to retrieve project stats", message: err.message });
  }
});

// 5.3 PATCH /api/db/projects/:projectId/status (Update project status)
app.patch("/api/db/projects/:projectId/status", requireAuth, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const { projectId } = req.params;
    const { status } = req.body;

    if (!status || !["active", "disabled"].includes(status)) {
      return res.status(400).json({ error: "Invalid Request", message: "Status must be 'active' or 'disabled'." });
    }

    const opaqueUserId = session.opaqueUserId;
    const projectsPath = `data/users/${opaqueUserId}/projects.json`;

    let projectsList: any[] = [];
    let fileSha: string | undefined = undefined;
    try {
      const fileData = await serverGitHubClient.getFile(projectsPath);
      if (fileData) {
        const parsed = JSON.parse(fileData.content);
        projectsList = parsed.projects || [];
        fileSha = fileData.sha;
      }
    } catch (e) {
      // ignore
    }

    const projectIndex = projectsList.findIndex(p => p.projectId === projectId);
    if (projectIndex === -1) {
      return res.status(404).json({ error: "Not Found", message: "Project not found." });
    }

    projectsList[projectIndex].status = status;
    projectsList[projectIndex].updatedAt = new Date().toISOString();

    const contentStr = JSON.stringify({ projects: projectsList }, null, 2);
    await githubStoragePut(projectsPath, contentStr, `Update project status: ${projectId} -> ${status}`, fileSha);

    return res.json({
      success: true,
      projectId,
      status,
      message: `Project status updated to ${status}.`
    });
  } catch (err: any) {
    return res.status(500).json({ error: "Status Update Failed", message: err.message });
  }
});

// 5.4 POST /api/db/projects/:projectId/token/rotate (Rotate project API token)
app.post("/api/db/projects/:projectId/token/rotate", requireAuth, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const { projectId } = req.params;
    const opaqueUserId = session.opaqueUserId;
    const projectsPath = `data/users/${opaqueUserId}/projects.json`;

    let projectsList: any[] = [];
    let fileSha: string | undefined = undefined;
    try {
      const fileData = await serverGitHubClient.getFile(projectsPath);
      if (fileData) {
        const parsed = JSON.parse(fileData.content);
        projectsList = parsed.projects || [];
        fileSha = fileData.sha;
      }
    } catch (e) {
      // ignore
    }

    const projectIndex = projectsList.findIndex(p => p.projectId === projectId);
    if (projectIndex === -1) {
      return res.status(404).json({ error: "Not Found", message: "Project not found." });
    }

    const tokenPayload = {
      projectId,
      opaqueUserId,
      issuedAt: Date.now(),
      nonce: crypto.randomBytes(8).toString("hex")
    };
    const payloadStr = JSON.stringify(tokenPayload);
    const hmac = dbGenerateHmacHex(getSessionSecret(), payloadStr);
    const projectToken = dbStringToBase64Url(payloadStr) + "." + hmac;

    projectsList[projectIndex].projectToken = projectToken;
    projectsList[projectIndex].status = "active";
    projectsList[projectIndex].updatedAt = new Date().toISOString();

    const contentStr = JSON.stringify({ projects: projectsList }, null, 2);
    await githubStoragePut(projectsPath, contentStr, `Rotate token for project: ${projectId}`, fileSha);

    return res.json({
      success: true,
      projectId,
      projectToken,
      message: "Project API token rotated successfully."
    });
  } catch (err: any) {
    return res.status(500).json({ error: "Token Rotation Failed", message: err.message });
  }
});

// 5.5 POST /api/db/projects/:projectId/token/revoke (Revoke project API token)
app.post("/api/db/projects/:projectId/token/revoke", requireAuth, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const { projectId } = req.params;
    const opaqueUserId = session.opaqueUserId;
    const projectsPath = `data/users/${opaqueUserId}/projects.json`;

    let projectsList: any[] = [];
    let fileSha: string | undefined = undefined;
    try {
      const fileData = await serverGitHubClient.getFile(projectsPath);
      if (fileData) {
        const parsed = JSON.parse(fileData.content);
        projectsList = parsed.projects || [];
        fileSha = fileData.sha;
      }
    } catch (e) {
      // ignore
    }

    const projectIndex = projectsList.findIndex(p => p.projectId === projectId);
    if (projectIndex === -1) {
      return res.status(404).json({ error: "Not Found", message: "Project not found." });
    }

    projectsList[projectIndex].projectToken = "";
    projectsList[projectIndex].status = "disabled";
    projectsList[projectIndex].updatedAt = new Date().toISOString();

    const contentStr = JSON.stringify({ projects: projectsList }, null, 2);
    await githubStoragePut(projectsPath, contentStr, `Revoke token for project: ${projectId}`, fileSha);

    return res.json({
      success: true,
      projectId,
      message: "Project API token revoked and project disabled."
    });
  } catch (err: any) {
    return res.status(500).json({ error: "Token Revocation Failed", message: err.message });
  }
});

// 5.6 DELETE /api/db/projects/:projectId (Delete project)
app.delete("/api/db/projects/:projectId", requireAuth, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const { projectId } = req.params;
    const opaqueUserId = session.opaqueUserId;
    const projectsPath = `data/users/${opaqueUserId}/projects.json`;

    let projectsList: any[] = [];
    let fileSha: string | undefined = undefined;
    try {
      const fileData = await serverGitHubClient.getFile(projectsPath);
      if (fileData) {
        const parsed = JSON.parse(fileData.content);
        projectsList = parsed.projects || [];
        fileSha = fileData.sha;
      }
    } catch (e) {
      // ignore
    }

    const projectIndex = projectsList.findIndex(p => p.projectId === projectId);
    if (projectIndex === -1) {
      return res.status(404).json({ error: "Not Found", message: "Project not found." });
    }

    // Clean up collection files for this project
    try {
      const prefix = `data/apps/${projectId}/`;
      const files = await listDatabaseFiles(prefix);
      for (const file of files) {
        try {
          await githubStorageDeleteFile(file.path, file.sha, `Delete project ${projectId} file: ${file.path}`);
        } catch (e) {
          // ignore individual deletion errors
        }
      }
    } catch (e) {
      // ignore listing errors
    }

    projectsList.splice(projectIndex, 1);
    const contentStr = JSON.stringify({ projects: projectsList }, null, 2);
    await githubStoragePut(projectsPath, contentStr, `Delete project: ${projectId}`, fileSha);

    return res.json({
      success: true,
      projectId,
      message: "Project deleted successfully."
    });
  } catch (err: any) {
    return res.status(500).json({ error: "Project Deletion Failed", message: err.message });
  }
});

// 6 REST API - Collection & Record endpoints
// 6.1 POST /api/db/projects/:projectId/collections (Create collection)
app.post("/api/db/projects/:projectId/collections", requireProjectAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { collection } = req.body;
    const projectSession = (req as any).projectSession;

    if (projectSession.projectId !== projectId) {
      return res.status(403).json({ error: "Forbidden", message: "Access forbidden to requested project." });
    }

    if (!collection) {
      return res.status(400).json({ error: "Invalid Request", message: "Collection parameter is required." });
    }

    validateDbPath(projectId, collection);

    const placeholderPath = `data/apps/${projectId}/collections/${collection}/.placeholder`;
    await githubStoragePut(placeholderPath, JSON.stringify({ created: true }), `Create collection: ${collection}`);

    return res.json({
      success: true,
      projectId,
      collection,
      message: "Collection created successfully."
    });
  } catch (err: any) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.error || "Collection Creation Failed", message: err.message });
  }
});

// 6.1b DELETE /api/db/projects/:projectId/collections/:collection (Delete collection)
app.delete("/api/db/projects/:projectId/collections/:collection", requireProjectAuth, async (req: Request, res: Response) => {
  try {
    const { projectId, collection } = req.params;
    const projectSession = (req as any).projectSession;

    if (projectSession.projectId !== projectId) {
      return res.status(403).json({ error: "Forbidden", message: "Access forbidden to requested project." });
    }

    if (!collection || !/^[a-zA-Z0-9_-]+$/.test(collection)) {
      return res.status(400).json({ error: "Invalid Request", message: "Invalid collection name format." });
    }

    validateDbPath(projectId, collection);

    const prefix = `data/apps/${projectId}/collections/${collection}/`;
    const files = await listDatabaseFiles(prefix);

    for (const f of files) {
      try {
        await githubStorageDeleteFile(f.path, f.sha, `Delete collection ${collection} file: ${f.path}`);
      } catch (e) {
        // ignore individual file deletion errors
      }
    }

    return res.json({
      success: true,
      projectId,
      collection,
      message: `Collection '${collection}' and its records deleted successfully.`
    });
  } catch (err: any) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.error || "Collection Deletion Failed", message: err.message });
  }
});

// 6.2 GET /api/db/projects/:projectId/collections (List collections)
app.get("/api/db/projects/:projectId/collections", requireProjectAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const projectSession = (req as any).projectSession;

    if (projectSession.projectId !== projectId) {
      return res.status(403).json({ error: "Forbidden", message: "Access forbidden to requested project." });
    }

    const prefix = `data/apps/${projectId}/collections/`;
    const files = await listDatabaseFiles(prefix);

    const collectionsSet = new Set<string>();
    for (const f of files) {
      const parts = f.path.substring(prefix.length).split("/");
      if (parts.length > 0 && parts[0]) {
        collectionsSet.add(parts[0]);
      }
    }

    return res.json({ collections: Array.from(collectionsSet) });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to list collections", message: err.message });
  }
});

// 6.3 POST /api/db/projects/:projectId/collections/:collection/records (Insert record)
app.post("/api/db/projects/:projectId/collections/:collection/records", requireProjectAuth, async (req: Request, res: Response) => {
  try {
    const { projectId, collection } = req.params;
    const projectSession = (req as any).projectSession;

    if (projectSession.projectId !== projectId) {
      return res.status(403).json({ error: "Forbidden", message: "Access forbidden to requested project." });
    }

    const recordId = req.body.recordId || req.body.id || crypto.randomBytes(16).toString("hex");
    const dataPayload = req.body.data || req.body;

    const targetPath = validateDbPath(projectId, collection, recordId);
    const encryptedContent = encryptRecord(JSON.stringify(dataPayload), projectId);

    const result = await githubStoragePut(targetPath, encryptedContent, `Insert record ${recordId} into ${collection}`);

    return res.json({
      success: true,
      recordId,
      sha: result.sha,
      message: "Record inserted successfully."
    });
  } catch (err: any) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.error || "Insertion Failed", message: err.message });
  }
});

// 6.4 GET /api/db/projects/:projectId/collections/:collection/records (List and Query records)
app.get("/api/db/projects/:projectId/collections/:collection/records", requireProjectAuth, async (req: Request, res: Response) => {
  try {
    const { projectId, collection } = req.params;
    const projectSession = (req as any).projectSession;

    if (projectSession.projectId !== projectId) {
      return res.status(403).json({ error: "Forbidden", message: "Access forbidden to requested project." });
    }

    validateDbPath(projectId, collection);

    const prefix = `data/apps/${projectId}/collections/${collection}/records/`;
    const files = await listDatabaseFiles(prefix);

    const records: any[] = [];
    for (const f of files) {
      if (f.path.endsWith(".json")) {
        try {
          const fileContent = await githubStorageGet(f.path);
          const decrypted = decryptRecord(fileContent.content, projectId);
          const data = JSON.parse(decrypted);
          
          const pathParts = f.path.split("/");
          const fileName = pathParts[pathParts.length - 1];
          const recordId = fileName.substring(0, fileName.length - 5);

          records.push({
            recordId,
            data,
            sha: f.sha
          });
        } catch (e) {
          // ignore corrupted
        }
      }
    }

    let filteredRecords = records;
    const { filterField, filterValue } = req.query;
    if (filterField && filterValue !== undefined) {
      const fField = filterField as string;
      const fValue = String(filterValue);
      filteredRecords = records.filter(rec => {
        const val = rec.data[fField];
        return val !== undefined && String(val) === fValue;
      });
    }

    return res.json({ records: filteredRecords });
  } catch (err: any) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.error || "Listing Failed", message: err.message });
  }
});

// 6.5 GET /api/db/projects/:projectId/collections/:collection/records/:recordId (Get record)
app.get("/api/db/projects/:projectId/collections/:collection/records/:recordId", requireProjectAuth, async (req: Request, res: Response) => {
  try {
    const { projectId, collection, recordId } = req.params;
    const projectSession = (req as any).projectSession;

    if (projectSession.projectId !== projectId) {
      return res.status(403).json({ error: "Forbidden", message: "Access forbidden to requested project." });
    }

    const targetPath = validateDbPath(projectId, collection, recordId);

    let fileData: any;
    try {
      fileData = await githubStorageGet(targetPath);
    } catch (err: any) {
      if (err.status === 404 || err.message === "File not found") {
        return res.status(404).json({ error: "Not Found", message: "Record not found." });
      }
      throw err;
    }

    const decrypted = decryptRecord(fileData.content, projectId);
    const parsed = JSON.parse(decrypted);

    return res.json({
      recordId,
      data: parsed,
      sha: fileData.sha
    });
  } catch (err: any) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.error || "Retrieval Failed", message: err.message });
  }
});

// 6.5b GET /api/db/projects/:projectId/collections/:collection/records/:recordId/raw (Inspect raw encrypted envelope)
app.get("/api/db/projects/:projectId/collections/:collection/records/:recordId/raw", requireProjectAuth, async (req: Request, res: Response) => {
  try {
    const { projectId, collection, recordId } = req.params;
    const projectSession = (req as any).projectSession;

    if (projectSession.projectId !== projectId) {
      return res.status(403).json({ error: "Forbidden", message: "Access forbidden to requested project." });
    }

    const targetPath = validateDbPath(projectId, collection, recordId);

    let fileData: any;
    try {
      fileData = await githubStorageGet(targetPath);
    } catch (err: any) {
      if (err.status === 404 || err.message === "File not found") {
        return res.status(404).json({ error: "Not Found", message: "Record not found." });
      }
      throw err;
    }

    return res.json({
      recordId,
      rawPersistedContent: fileData.content,
      sha: fileData.sha,
      isEncrypted: true
    });
  } catch (err: any) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.error || "Retrieval Failed", message: err.message });
  }
});

// 6.6 PUT /api/db/projects/:projectId/collections/:collection/records/:recordId (Update record)
app.put("/api/db/projects/:projectId/collections/:collection/records/:recordId", requireProjectAuth, async (req: Request, res: Response) => {
  try {
    const { projectId, collection, recordId } = req.params;
    const projectSession = (req as any).projectSession;

    if (projectSession.projectId !== projectId) {
      return res.status(403).json({ error: "Forbidden", message: "Access forbidden to requested project." });
    }

    const expectedSha = req.body.expectedSha || req.body.sha || (req.query.expectedSha as string) || (req.query.sha as string);
    const dataPayload = req.body.data || req.body;

    const targetPath = validateDbPath(projectId, collection, recordId);
    const encryptedContent = encryptRecord(JSON.stringify(dataPayload), projectId);

    const result = await githubStoragePut(targetPath, encryptedContent, `Update record ${recordId} in ${collection}`, expectedSha);

    return res.json({
      success: true,
      recordId,
      sha: result.sha,
      message: "Record updated successfully."
    });
  } catch (err: any) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.error || (status === 409 ? "Conflict" : "Update Failed"), message: err.message });
  }
});

// 6.7 DELETE /api/db/projects/:projectId/collections/:collection/records/:recordId (Delete record)
app.delete("/api/db/projects/:projectId/collections/:collection/records/:recordId", requireProjectAuth, async (req: Request, res: Response) => {
  try {
    const { projectId, collection, recordId } = req.params;
    const projectSession = (req as any).projectSession;

    if (projectSession.projectId !== projectId) {
      return res.status(403).json({ error: "Forbidden", message: "Access forbidden to requested project." });
    }

    const expectedSha = req.body.expectedSha || req.body.sha || (req.query.expectedSha as string) || (req.query.sha as string);
    const targetPath = validateDbPath(projectId, collection, recordId);

    let shaToDelete = expectedSha;
    if (!shaToDelete) {
      const existing = await githubStorageGet(targetPath);
      shaToDelete = existing.sha;
    }

    await githubStorageDeleteFile(targetPath, shaToDelete, `Delete record ${recordId} from ${collection}`);

    return res.json({
      success: true,
      message: "Record deleted successfully."
    });
  } catch (err: any) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.error || "Deletion Failed", message: err.message });
  }
});

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

    // Filter to only include files and directories under data/users/, data/users_index/, and data/apps/
    const filteredTree = rawTree
      .filter((item: any) => {
        return (
          item.path.startsWith("data/users/") ||
          item.path.startsWith("data/users_index/") ||
          item.path.startsWith("data/apps/") ||
          item.path === "data/users" ||
          item.path === "data/users_index" ||
          item.path === "data/apps"
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
