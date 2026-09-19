import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";
import { EventEmitter } from "events";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

console.log("==================================================");
console.log("VERCEL SERVERLESS PRODUCTION VERIFICATION");
console.log("==================================================");

// 1. Inspect generated files
const apiIndexPath = path.join(rootDir, "api", "index.js");
const apiPathPath = path.join(rootDir, "api", "[...path].js");

if (!fs.existsSync(apiIndexPath)) {
  console.error("FAIL: api/index.js does not exist!");
  process.exit(1);
}
console.log("✓ api/index.js exists");

if (!fs.existsSync(apiPathPath)) {
  console.error("FAIL: api/[...path].js does not exist!");
  process.exit(1);
}
console.log("✓ api/[...path].js exists");

// 2. Inspect file contents for problematic imports
const indexContent = fs.readFileSync(apiIndexPath, "utf-8");
const pathContent = fs.readFileSync(apiPathPath, "utf-8");

const forbiddenPatterns = [
  /import\s+.*from\s+['"][^'"]*\/src\/server\/app['"]/,
  /import\s+.*from\s+['"]\.\.\/src\/server\/app['"]/,
  /require\s*\(\s*['"][^'"]*\/src\/server\/app['"]\s*\)/,
  /require\s*\(\s*['"]\.\.\/src\/server\/app['"]\s*\)/,
];

for (const pattern of forbiddenPatterns) {
  if (pattern.test(indexContent)) {
    console.error(`FAIL: api/index.js contains forbidden unresolved import matching ${pattern}`);
    process.exit(1);
  }
  if (pattern.test(pathContent)) {
    console.error(`FAIL: api/[...path].js contains forbidden unresolved import matching ${pattern}`);
    process.exit(1);
  }
}
console.log("✓ No unresolved imports to /src/server/app found in generated bundles");

// Verify that all relative imports stay within api/
const relativeImportsIndex = indexContent.match(/from\s+['"](\.[^'"]+)['"]/g) || [];
for (const imp of relativeImportsIndex) {
  const spec = imp.replace(/from\s+['"]/, "").replace(/['"]$/, "");
  if (spec.startsWith("../")) {
    console.error(`FAIL: api/index.js has relative import escaping api/: ${spec}`);
    process.exit(1);
  }
}
console.log("✓ api/index.js is completely self-contained (zero relative imports escaping api/)");

// 3. Helper to create mock IncomingMessage and ServerResponse
function createMockHttp(options) {
  const req = new EventEmitter();
  req.method = options.method || "GET";
  req.url = options.url || "/api/health";
  req.headers = options.headers || {};

  const res = new EventEmitter();
  res.statusCode = 200;
  res._headers = {};
  res._data = "";

  res.setHeader = (key, val) => {
    res._headers[key.toLowerCase()] = val;
  };
  res.getHeader = (key) => res._headers[key.toLowerCase()];

  let resolvePromise;
  const promise = new Promise((resolve) => {
    resolvePromise = resolve;
  });

  res.end = (chunk) => {
    if (chunk) res._data += chunk.toString();
    res.emit("finish");
    resolvePromise({
      statusCode: res.statusCode,
      headers: res._headers,
      body: res._data,
    });
  };

  res.write = (chunk) => {
    if (chunk) res._data += chunk.toString();
    return true;
  };

  res.status = (code) => {
    res.statusCode = code;
    return res;
  };

  res.json = (obj) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(obj));
  };

  res.send = (body) => {
    res.end(body);
  };

  return { req, res, promise };
}

// 4. Test importing the serverless functions in Node ESM runtime
console.log("\nSimulating Vercel Node runtime dynamic imports...");

let indexModule, pathModule;
try {
  indexModule = await import(`file://${apiIndexPath}?t=${Date.now()}`);
  console.log("✓ Successfully loaded api/index.js in Node ESM");
} catch (err) {
  console.error("FAIL: Could not load api/index.js:", err);
  process.exit(1);
}

try {
  pathModule = await import(`file://${apiPathPath}?t=${Date.now()}`);
  console.log("✓ Successfully loaded api/[...path].js in Node ESM");
} catch (err) {
  console.error("FAIL: Could not load api/[...path].js:", err);
  process.exit(1);
}

const indexHandler = indexModule.default;
const pathHandler = pathModule.default;

if (typeof indexHandler !== "function") {
  console.error("FAIL: api/index.js does not export a default handler function!");
  process.exit(1);
}

// 5. Test suite for endpoints
const tests = [
  {
    name: "GET /api/health (via api/index.js)",
    handler: indexHandler,
    method: "GET",
    url: "/api/health",
    headers: { host: "github-encrypted-vault.vercel.app" },
    expectedStatus: 200,
    checkBody: (body) => {
      const json = JSON.parse(body);
      return json.ok === true && json.status === "healthy";
    },
  },
  {
    name: "GET /api/health (via api/[...path].js)",
    handler: pathHandler,
    method: "GET",
    url: "/api/health",
    headers: { host: "github-encrypted-vault.vercel.app" },
    expectedStatus: 200,
    checkBody: (body) => {
      const json = JSON.parse(body);
      return json.ok === true && json.status === "healthy";
    },
  },
  {
    name: "GET /health (URL normalized to /api/health)",
    handler: indexHandler,
    method: "GET",
    url: "/health",
    headers: { host: "github-encrypted-vault.vercel.app" },
    expectedStatus: 200,
    checkBody: (body) => JSON.parse(body).ok === true,
  },
  {
    name: "GET /api/health with x-vercel-original-url header",
    handler: indexHandler,
    method: "GET",
    url: "/api",
    headers: {
      host: "github-encrypted-vault.vercel.app",
      "x-vercel-original-url": "/api/health",
    },
    expectedStatus: 200,
    checkBody: (body) => JSON.parse(body).ok === true,
  },
  {
    name: "GET /api/vault/stats",
    handler: pathHandler,
    method: "GET",
    url: "/api/vault/stats",
    headers: { host: "github-encrypted-vault.vercel.app" },
    expectedStatus: 200,
    checkBody: (body) => {
      const json = JSON.parse(body);
      return json.ok === true && json.storage && json.storage.provider === "github";
    },
  },
  {
    name: "POST /api/vault/test-sync",
    handler: pathHandler,
    method: "POST",
    url: "/api/vault/test-sync",
    headers: { host: "github-encrypted-vault.vercel.app", "content-type": "application/json" },
    expectedStatus: (s) => s === 200 || s === 503, // 503 in production without PAT, 200 with local
  },
  {
    name: "POST /api/vault/register (empty body validation)",
    handler: pathHandler,
    method: "POST",
    url: "/api/vault/register",
    headers: { host: "github-encrypted-vault.vercel.app", "content-type": "application/json" },
    expectedStatus: (s) => s === 400 || s === 503, // Returns 400 invalid request or 503 missing PAT
  },
  {
    name: "POST /api/vault/unlock (empty body validation)",
    handler: pathHandler,
    method: "POST",
    url: "/api/vault/unlock",
    headers: { host: "github-encrypted-vault.vercel.app", "content-type": "application/json" },
    expectedStatus: 400,
  },
  {
    name: "POST /api/vault/lock (unauthenticated validation)",
    handler: pathHandler,
    method: "POST",
    url: "/api/vault/lock",
    headers: { host: "github-encrypted-vault.vercel.app" },
    expectedStatus: 401,
  },
  {
    name: "POST /api/vault/store (unauthenticated validation)",
    handler: pathHandler,
    method: "POST",
    url: "/api/vault/store",
    headers: { host: "github-encrypted-vault.vercel.app" },
    expectedStatus: 401,
  },
  {
    name: "POST /api/vault/retrieve (unauthenticated validation)",
    handler: pathHandler,
    method: "POST",
    url: "/api/vault/retrieve",
    headers: { host: "github-encrypted-vault.vercel.app" },
    expectedStatus: 401,
  },
  {
    name: "POST /api/vault/delete (unauthenticated validation)",
    handler: pathHandler,
    method: "POST",
    url: "/api/vault/delete",
    headers: { host: "github-encrypted-vault.vercel.app" },
    expectedStatus: 401,
  },
  {
    name: "GET /api/vault/tree (unauthenticated validation)",
    handler: pathHandler,
    method: "GET",
    url: "/api/vault/tree",
    headers: { host: "github-encrypted-vault.vercel.app" },
    expectedStatus: 401,
  },
];

console.log("\nExecuting endpoint verification tests against serverless bundle:");
let passedCount = 0;

for (const test of tests) {
  const { req, res, promise } = createMockHttp(test);
  try {
    test.handler(req, res);
    const result = await promise;
    const statusMatches =
      typeof test.expectedStatus === "function"
        ? test.expectedStatus(result.statusCode)
        : result.statusCode === test.expectedStatus;

    const bodyMatches = test.checkBody ? test.checkBody(result.body) : true;

    if (statusMatches && bodyMatches) {
      console.log(`✓ ${test.name} -> HTTP ${result.statusCode}`);
      passedCount++;
    } else {
      console.error(
        `✗ ${test.name} FAILED! Status: ${result.statusCode} (expected: ${test.expectedStatus}), Body: ${result.body}`
      );
      process.exit(1);
    }
  } catch (err) {
    console.error(`✗ ${test.name} threw an exception:`, err);
    process.exit(1);
  }
}

console.log(`\nAll ${passedCount}/${tests.length} Vercel serverless verification tests PASSED!`);
console.log("==================================================");
