import type { IncomingMessage, ServerResponse } from "http";
import app from "./app";

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
  "worker",
]);

/**
 * Normalizes incoming request URLs across Vercel production rewrites and direct calls.
 * Preserves query strings, handles Vercel rewrite parameter capture (?1=... or x-now-route-matches),
 * and maps stripped sub-routes (such as /vault/register or /register) to canonical /api/vault routes.
 */
export function normalizeVaultUrl(rawUrl: string, headers?: Record<string, any>): string {
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

  // Health check routes
  if (pathname === "/health" || pathname === "/api/health" || pathname.endsWith("/health")) {
    return `/api/health${query}`;
  }

  // Testing routes
  if (pathname.startsWith("/testing/")) {
    return `/api${pathname}${query}`;
  }

  // Vault routes already canonical
  if (pathname.startsWith("/api/vault/") || pathname === "/api/vault") {
    return `${pathname}${query}`;
  }

  // Vault routes prefixed with /vault
  if (pathname.startsWith("/vault/") || pathname === "/vault") {
    return `/api${pathname}${query}`;
  }

  // Check for bare vault endpoints like /register, /login, /tree, /file
  const cleanPath = pathname.startsWith("/") ? pathname.slice(1) : pathname;
  const segments = cleanPath.split("/").filter(Boolean);
  if (segments.length > 0 && VAULT_SUBROUTES.has(segments[0])) {
    return `/api/vault/${segments.join("/")}${query}`;
  }

  // Other routes: preserve /api prefix if missing
  if (!pathname.startsWith("/api")) {
    const prefixed = "/api" + (pathname.startsWith("/") ? pathname : "/" + pathname);
    return `${prefixed}${query}`;
  }

  return `${pathname}${query}`;
}

export default function handler(req: IncomingMessage, res: ServerResponse) {
  // Normalize URL based on headers and path
  req.url = normalizeVaultUrl(req.url || "/", req.headers as Record<string, any>);

  const cleanUrl = (req.url || "").split("?")[0];

  // Critical Rule: Health endpoint MUST NOT require storage, database, PAT, or complex initialization
  if (cleanUrl === "/api/health") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        ok: true,
        status: "healthy",
      })
    );
    return;
  }

  return (app as any)(req, res);
}

export { app };
