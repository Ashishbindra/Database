import type { IncomingMessage, ServerResponse } from "http";
import app from "./app";

export default function handler(req: IncomingMessage, res: ServerResponse) {
  // Normalize URL if Vercel sets rewrite headers
  const originalUrl =
    (req.headers &&
      (req.headers["x-vercel-original-url"] ||
        req.headers["x-forwarded-uri"] ||
        req.headers["x-original-url"] ||
        req.headers["x-matched-path"])) as string;

  if (originalUrl && typeof originalUrl === "string") {
    req.url = originalUrl;
  }

  // Ensure leading /api prefix is preserved for Express routes if stripped by Vercel
  if (req.url && !req.url.startsWith("/api") && !req.url.startsWith("/index.html")) {
    req.url = "/api" + (req.url.startsWith("/") ? req.url : "/" + req.url);
  }

  const cleanUrl = (req.url || "").split("?")[0];

  // Critical Rule: Health endpoint MUST NOT require storage, database, PAT, or complex initialization
  if (cleanUrl === "/api/health" || cleanUrl === "/health" || cleanUrl.endsWith("/health")) {
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
