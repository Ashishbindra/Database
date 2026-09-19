import app from "./src/server/app";
import express, { Request, Response } from "express";
import path from "path";

export { app };
export default app;

const PORT = 3000;

// Start Express + Vite Dev or Production Server
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express Vault API Server running on http://0.0.0.0:${PORT}`);
  });
}

// Ensure app.listen() is NEVER executed inside Vercel's serverless runtime or when imported
const isDirectRun = Boolean(
  process.argv[1] &&
  (process.argv[1].endsWith("server.ts") || process.argv[1].endsWith("server.cjs") || process.argv[1].endsWith("server.js"))
);

const isServerless = Boolean(
  process.env.VERCEL ||
  process.env.NOW_REGION ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.LAMBDA_TASK_ROOT ||
  process.env.IS_SERVERLESS_RUNTIME
);

if (!isServerless && isDirectRun && process.env.NODE_ENV !== "test") {
  startServer();
}
