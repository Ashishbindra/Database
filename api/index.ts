import type { IncomingMessage, ServerResponse } from "http";
import app from "../src/server/app";

export default function handler(req: IncomingMessage, res: ServerResponse) {
  // Normalize URL if Vercel sets rewrite headers
  const originalUrl =
    (req.headers &&
      (req.headers["x-vercel-original-url"] ||
        req.headers["x-forwarded-uri"] ||
        req.headers["x-original-url"])) as string;

  if (originalUrl && typeof originalUrl === "string") {
    req.url = originalUrl;
  }

  const cleanUrl = (req.url || "").split("?")[0];

  // Critical Rule: Health endpoint MUST NOT require storage or complex initialization
  if (cleanUrl === "/api/health" || cleanUrl === "/health") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        ok: true,
        runtime: "vercel",
        status: "healthy",
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  return app(req as any, res as any);
}

export { app };
