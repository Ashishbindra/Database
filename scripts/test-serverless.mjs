import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
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

if (fs.existsSync(apiPathPath)) {
  console.error("FAIL: api/[...path].js exists! Duplicate/conflicting Vercel entrypoints must be removed.");
  process.exit(1);
}
console.log("✓ api/[...path].js does not exist (no conflicting duplicate functions)");

// 2. Inspect file contents for problematic unbundled imports
const indexContent = fs.readFileSync(apiIndexPath, "utf-8");

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
}
console.log("✓ No unresolved imports to /src/server/app found in generated bundle");

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

  // If request has body, simulate chunk emission after listener attaches
  if (options.body) {
    process.nextTick(() => {
      const dataStr = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
      req.emit("data", Buffer.from(dataStr));
      req.emit("end");
    });
  } else {
    process.nextTick(() => {
      req.emit("end");
    });
  }

  return { req, res, promise };
}

// 4. Test importing the serverless function in Node ESM runtime
console.log("\nSimulating Vercel Node runtime dynamic import...");

let indexModule;
try {
  indexModule = await import(`file://${apiIndexPath}?t=${Date.now()}`);
  console.log("✓ Successfully loaded api/index.js in Node ESM");
} catch (err) {
  console.error("FAIL: Could not load api/index.js:", err);
  process.exit(1);
}

const indexHandler = indexModule.default;

if (typeof indexHandler !== "function") {
  console.error("FAIL: api/index.js does not export a default handler function!");
  process.exit(1);
}

// 5. Test suite for endpoints & URL normalization
const tests = [
  // Health checks
  {
    name: "GET /api/health (direct)",
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
    name: "GET /health (normalized to /api/health)",
    handler: indexHandler,
    method: "GET",
    url: "/health",
    headers: { host: "github-encrypted-vault.vercel.app" },
    expectedStatus: 200,
    checkBody: (body) => JSON.parse(body).ok === true,
  },
  {
    name: "GET /api with x-vercel-original-url: /api/health",
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
    name: "GET /api with x-forwarded-uri: /api/health",
    handler: indexHandler,
    method: "GET",
    url: "/api",
    headers: {
      host: "github-encrypted-vault.vercel.app",
      "x-forwarded-uri": "/api/health",
    },
    expectedStatus: 200,
    checkBody: (body) => JSON.parse(body).ok === true,
  },
  {
    name: "GET /api with x-now-route-matches: 1=health",
    handler: indexHandler,
    method: "GET",
    url: "/api",
    headers: {
      host: "github-encrypted-vault.vercel.app",
      "x-now-route-matches": "1=health",
    },
    expectedStatus: 200,
    checkBody: (body) => JSON.parse(body).ok === true,
  },

  // Registration route & normalization tests
  {
    name: "POST /api/vault/register (canonical, empty body -> 400 validation)",
    handler: indexHandler,
    method: "POST",
    url: "/api/vault/register",
    headers: { host: "github-encrypted-vault.vercel.app", "content-type": "application/json" },
    body: {},
    expectedStatus: (s) => s === 400 || s === 503,
    checkBody: (body) => {
      const json = JSON.parse(body);
      return json.error === "Invalid Request" || json.error === "CONFIGURATION_ERROR";
    },
  },
  {
    name: "POST /vault/register (stripped /api prefix -> normalized to /api/vault/register)",
    handler: indexHandler,
    method: "POST",
    url: "/vault/register",
    headers: { host: "github-encrypted-vault.vercel.app", "content-type": "application/json" },
    body: {},
    expectedStatus: (s) => s === 400 || s === 503,
  },
  {
    name: "POST /register (bare endpoint -> normalized to /api/vault/register)",
    handler: indexHandler,
    method: "POST",
    url: "/register",
    headers: { host: "github-encrypted-vault.vercel.app", "content-type": "application/json" },
    body: {},
    expectedStatus: (s) => s === 400 || s === 503,
  },
  {
    name: "POST /api with x-vercel-original-url: /api/vault/register",
    handler: indexHandler,
    method: "POST",
    url: "/api",
    headers: {
      host: "github-encrypted-vault.vercel.app",
      "content-type": "application/json",
      "x-vercel-original-url": "/api/vault/register",
    },
    body: {},
    expectedStatus: (s) => s === 400 || s === 503,
  },
  {
    name: "POST /api with x-now-route-matches: 1=vault%2Fregister",
    handler: indexHandler,
    method: "POST",
    url: "/api",
    headers: {
      host: "github-encrypted-vault.vercel.app",
      "content-type": "application/json",
      "x-now-route-matches": "1=vault%2Fregister",
    },
    body: {},
    expectedStatus: (s) => s === 400 || s === 503,
  },
  {
    name: "POST /api?1=vault%2Fregister (Vercel rewrite query parameter format)",
    handler: indexHandler,
    method: "POST",
    url: "/api?1=vault%2Fregister",
    headers: {
      host: "github-encrypted-vault.vercel.app",
      "content-type": "application/json",
    },
    body: {},
    expectedStatus: (s) => s === 400 || s === 503,
  },
  {
    name: "GET /api?1=vault%2Ffile&path=test.json (Vercel rewrite query param stripping & preservation)",
    handler: indexHandler,
    method: "GET",
    url: "/api?1=vault%2Ffile&path=test.json",
    headers: { host: "github-encrypted-vault.vercel.app" },
    expectedStatus: 401,
  },
  {
    name: "GET /api/nonexistent-endpoint (unhandled /api/* returns 404 JSON)",
    handler: indexHandler,
    method: "GET",
    url: "/api/nonexistent-endpoint",
    headers: { host: "github-encrypted-vault.vercel.app" },
    expectedStatus: 404,
    checkBody: (body) => {
      const json = JSON.parse(body);
      return json.error === "Not Found";
    },
  },
  {
    name: "GET /api (bare /api returns 404 JSON)",
    handler: indexHandler,
    method: "GET",
    url: "/api",
    headers: { host: "github-encrypted-vault.vercel.app" },
    expectedStatus: 404,
    checkBody: (body) => {
      const json = JSON.parse(body);
      return json.error === "Not Found";
    },
  },

  // Other critical Vault routes
  {
    name: "POST /api/vault/login (empty body validation)",
    handler: indexHandler,
    method: "POST",
    url: "/api/vault/login",
    headers: { host: "github-encrypted-vault.vercel.app", "content-type": "application/json" },
    body: {},
    expectedStatus: 400,
  },
  {
    name: "POST /login (bare endpoint -> normalized to /api/vault/login)",
    handler: indexHandler,
    method: "POST",
    url: "/login",
    headers: { host: "github-encrypted-vault.vercel.app", "content-type": "application/json" },
    body: {},
    expectedStatus: 400,
  },
  {
    name: "GET /api/vault/tree (unauthenticated validation)",
    handler: indexHandler,
    method: "GET",
    url: "/api/vault/tree",
    headers: { host: "github-encrypted-vault.vercel.app" },
    expectedStatus: 401,
  },
  {
    name: "GET /tree (bare endpoint -> normalized to /api/vault/tree)",
    handler: indexHandler,
    method: "GET",
    url: "/tree",
    headers: { host: "github-encrypted-vault.vercel.app" },
    expectedStatus: 401,
  },
  {
    name: "GET /api/vault/file?path=test.json (query string preserved)",
    handler: indexHandler,
    method: "GET",
    url: "/api/vault/file?path=test.json",
    headers: { host: "github-encrypted-vault.vercel.app" },
    expectedStatus: 401,
  },
  {
    name: "GET /api/vault/stats",
    handler: indexHandler,
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
    handler: indexHandler,
    method: "POST",
    url: "/api/vault/test-sync",
    headers: { host: "github-encrypted-vault.vercel.app", "content-type": "application/json" },
    body: {},
    expectedStatus: (s) => s === 200 || s === 503,
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
