import type { IncomingMessage, ServerResponse } from "http";
import app from "../src/server/app";

export { app };

export default function handler(req: IncomingMessage, res: ServerResponse) {
  // Normalize URL if Vercel sets rewrite headers
  const originalUrl =
    (req.headers && req.headers["x-vercel-original-url"]) ||
    (req.headers && req.headers["x-forwarded-uri"]) ||
    (req.headers && req.headers["x-original-url"]);

  if (typeof originalUrl === "string" && originalUrl) {
    req.url = originalUrl;
  }

  // Diagnostic health endpoint
  const url = req.url || "";
  if (url === "/api/health" || url === "/health") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, status: "healthy", timestamp: new Date().toISOString() }));
    return;
  }

  return app(req, res);
}
