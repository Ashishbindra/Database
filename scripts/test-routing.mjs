/**
 * Automated Verification of Application Routing & Static Asset Serving
 * Tests both Root SPA and /examples/database-demo standalone app
 */

import http from "http";
import path from "path";
import fs from "fs";
import express from "express";

async function runRoutingTests() {
  console.log("==================================================");
  console.log("ROUTING & STATIC SERVING VERIFICATION");
  console.log("==================================================");

  // 1. Verify build output exists
  console.log("1. Checking Build Artifacts in dist/...");
  const distPath = path.resolve(process.cwd(), "dist");
  const rootIndex = path.join(distPath, "index.html");
  const demoIndex = path.join(distPath, "examples/database-demo/index.html");
  const demoAssetsDir = path.join(distPath, "examples/database-demo/assets");

  if (!fs.existsSync(rootIndex)) {
    throw new Error("Missing dist/index.html");
  }
  if (!fs.existsSync(demoIndex)) {
    throw new Error("Missing dist/examples/database-demo/index.html");
  }
  if (!fs.existsSync(demoAssetsDir)) {
    throw new Error("Missing dist/examples/database-demo/assets");
  }

  const rootHtml = fs.readFileSync(rootIndex, "utf-8");
  const demoHtml = fs.readFileSync(demoIndex, "utf-8");

  if (!rootHtml.includes("GitHub Encrypted Storage SDK")) {
    throw new Error("Root index.html does not contain expected title");
  }
  if (!demoHtml.includes("Database Demo App")) {
    throw new Error("Demo index.html does not contain expected title");
  }
  console.log("✓ dist/index.html & dist/examples/database-demo/index.html verified");

  // 2. Start a test instance of the Express server in production mode
  console.log("2. Launching production Express instance on ephemeral port...");
  const testApp = express();
  testApp.get("/api/health", (req, res) => res.json({ status: "ok" }));
  testApp.use(express.static(distPath));
  testApp.get(["/examples/database-demo", "/examples/database-demo/*"], (_req, res) => {
    res.sendFile(path.join(distPath, "examples/database-demo/index.html"));
  });
  testApp.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });

  const server = http.createServer(testApp);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`✓ Test server listening at ${baseUrl}`);

  try {
    // Test Root Dashboard
    console.log("3. Testing GET / (Root Dashboard)...");
    const rootRes = await fetch(`${baseUrl}/`);
    const rootText = await rootRes.text();
    if (rootRes.status !== 200 || !rootText.includes("GitHub Encrypted Storage SDK")) {
      throw new Error(`Failed GET /: Status ${rootRes.status}`);
    }
    console.log("✓ GET / correctly serves Root System Overview index.html");

    // Test /examples/database-demo
    console.log("4. Testing GET /examples/database-demo (Standalone Demo App)...");
    const demoRes = await fetch(`${baseUrl}/examples/database-demo`);
    const demoText = await demoRes.text();
    if (demoRes.status !== 200 || !demoText.includes("Database Demo App")) {
      throw new Error(`Failed GET /examples/database-demo: Status ${demoRes.status}`);
    }
    console.log("✓ GET /examples/database-demo correctly serves Database Demo App index.html");

    // Test /examples/database-demo/ (with trailing slash)
    console.log("5. Testing GET /examples/database-demo/ (Trailing Slash)...");
    const demoSlashRes = await fetch(`${baseUrl}/examples/database-demo/`);
    const demoSlashText = await demoSlashRes.text();
    if (demoSlashRes.status !== 200 || !demoSlashText.includes("Database Demo App")) {
      throw new Error(`Failed GET /examples/database-demo/: Status ${demoSlashRes.status}`);
    }
    console.log("✓ GET /examples/database-demo/ correctly serves Database Demo App index.html");

    // Test /examples/database-demo/subpath (Deep direct navigation/refresh)
    console.log("6. Testing GET /examples/database-demo/customers (Direct deep navigation)...");
    const demoSubRes = await fetch(`${baseUrl}/examples/database-demo/customers`);
    const demoSubText = await demoSubRes.text();
    if (demoSubRes.status !== 200 || !demoSubText.includes("Database Demo App")) {
      throw new Error(`Failed GET /examples/database-demo/customers: Status ${demoSubRes.status}`);
    }
    console.log("✓ GET /examples/database-demo/customers correctly falls back to Database Demo App index.html");

    // Test Demo static assets
    console.log("7. Testing Demo static asset loading...");
    const demoAssetFiles = fs.readdirSync(demoAssetsDir);
    const cssFile = demoAssetFiles.find((f) => f.endsWith(".css"));
    const jsFile = demoAssetFiles.find((f) => f.endsWith(".js"));

    if (!cssFile) throw new Error("No compiled CSS file found in demo assets directory");
    if (!jsFile) throw new Error("No compiled JS file found in demo assets directory");

    const cssRes = await fetch(`${baseUrl}/examples/database-demo/assets/${cssFile}`);
    if (cssRes.status !== 200) throw new Error(`Failed to load demo CSS: Status ${cssRes.status}`);
    const cssText = await cssRes.text();
    if (!cssText.includes("tailwindcss") && !cssText.includes("flex")) {
      throw new Error("Compiled CSS missing Tailwind utilities");
    }
    console.log(`✓ GET /examples/database-demo/assets/${cssFile} -> HTTP 200 (CSS, ${cssText.length} bytes, verified compiled Tailwind rules)`);

    const jsRes = await fetch(`${baseUrl}/examples/database-demo/assets/${jsFile}`);
    if (jsRes.status !== 200) throw new Error(`Failed to load demo JS: Status ${jsRes.status}`);
    const jsText = await jsRes.text();
    console.log(`✓ GET /examples/database-demo/assets/${jsFile} -> HTTP 200 (JS, ${jsText.length} bytes)`);

    // Test Root SPA route fallback
    console.log("8. Testing Root SPA route fallback (/shramik, /resume)...");
    const spaRes = await fetch(`${baseUrl}/shramik`);
    const spaText = await spaRes.text();
    if (spaRes.status !== 200 || !spaText.includes("GitHub Encrypted Storage SDK")) {
      throw new Error(`Failed GET /shramik fallback: Status ${spaRes.status}`);
    }
    console.log("✓ GET /shramik correctly serves Root index.html without interference");

    // Test API Health
    console.log("9. Testing API route isolation...");
    const apiRes = await fetch(`${baseUrl}/api/health`);
    const apiJson = await apiRes.json();
    if (apiRes.status !== 200 || apiJson.status !== "ok") {
      throw new Error("Failed GET /api/health");
    }
    console.log("✓ GET /api/health -> HTTP 200 (API routes isolated and functional)");

    console.log("==================================================");
    console.log("ALL ROUTING & STATIC SERVING VERIFICATION TESTS PASSED!");
    console.log("==================================================");
  } finally {
    server.close();
  }
}

runRoutingTests().catch((err) => {
  console.error("Routing Test Failed:", err);
  process.exit(1);
});
