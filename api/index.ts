import type { IncomingMessage, ServerResponse } from "http";

process.env.IS_SERVERLESS_RUNTIME = "true";
console.log("[DIAGNOSTIC] api/index.ts: module initialization reached");

let appInstance: any = null;
let initError: any = null;

async function getApp(): Promise<any> {
  if (appInstance) return appInstance;
  if (initError) throw initError;

  try {
    console.log("[DIAGNOSTIC] api/index.ts: server import reached");
    let serverMod: any;
    try {
      serverMod = await import("../server.js");
    } catch {
      serverMod = await import("../server");
    }
    appInstance = serverMod.default || serverMod.app || serverMod;
    console.log("[DIAGNOSTIC] api/index.ts: app export reached");
    return appInstance;
  } catch (err: any) {
    initError = err;
    console.error("[DIAGNOSTIC] Caught exception during server import:", {
      name: err?.name,
      message: err?.message,
      stack: err?.stack,
    });
    throw err;
  }
}

// Immediate eager import attempt
getApp().catch(() => {
  // Exception is safely stored in initError and logged above
});

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // Normalize URL if Vercel sets rewrite headers
  if (req.headers && req.headers["x-vercel-original-url"] && typeof req.headers["x-vercel-original-url"] === "string") {
    req.url = req.headers["x-vercel-original-url"];
  }

  // Diagnostic health endpoint
  const url = req.url || "";
  if (url === "/api/health" || url === "/health") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, status: "healthy", timestamp: new Date().toISOString() }));
    return;
  }

  try {
    const app = await getApp();
    return app(req, res);
  } catch (err: any) {
    console.error("[DIAGNOSTIC] Caught exception:", {
      name: err?.name,
      message: err?.message,
      stack: err?.stack,
    });

    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "FUNCTION_INVOCATION_FAILED",
          diagnostic: "Serverless function initialization failure",
          exceptionName: err?.name || "Error",
          exceptionMessage: err?.message || "Unknown error",
          exceptionStack: err?.stack || "",
        })
      );
    }
  }
}

