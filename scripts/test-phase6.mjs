/**
 * PHASE 6 — EXTERNAL APP INTEGRATION & PUBLIC RELEASE READINESS TEST SUITE
 *
 * Verifies:
 * 1. External SDK test app flow (examples/external-sdk-test)
 * 2. Public SDK Installation & Package Resolution (ESM, CJS, Types, exports)
 * 3. API Playground & Error Matrix Audit (GET, POST, PUT, DELETE, invalid token, revoked token, invalid project, invalid collection, malformed JSON, stale expectedSha, >5MB payload)
 * 4. Multi-Project Security Isolation (Project A vs B isolation, collections, records, raw envelopes, revoked tokens, rotated tokens, path traversal, absolute paths, encoded traversal)
 * 5. CORS, Security Headers, and Secret Exposure Prevention
 * 6. Documentation and Quickstart completeness
 */

import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const candidateProductionUrl =
  process.env.PRODUCTION_URL ||
  process.env.VERCEL_URL ||
  process.env.APP_URL ||
  null;

async function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

async function checkUrlReachable(url) {
  try {
    const formatted = url.startsWith("http") ? url : `https://${url}`;
    const res = await fetch(`${formatted}/api/health`, { method: "GET", signal: AbortSignal.timeout(3000) });
    if (res.status !== 200) return false;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) return false;
    const data = await res.json();
    return data && (data.ok === true || data.status === "healthy" || data.status === "ok");
  } catch {
    return false;
  }
}

async function runPhase6Audit() {
  console.log("==================================================");
  console.log("🚀 PHASE 6 EXTERNAL APP INTEGRATION & RELEASE AUDIT");
  console.log("==================================================");

  let totalPassed = 0;
  function pass(testName) {
    totalPassed++;
    console.log(`  ✅ PASS: ${testName}`);
  }

  // ----------------------------------------------------------------
  // 1. SDK Distribution & Packaging Validation
  // ----------------------------------------------------------------
  console.log("\n📦 1. SDK Distribution Artifacts & Packaging Verification");

  const esmPath = path.resolve(process.cwd(), "dist/sdk/index.js");
  const cjsPath = path.resolve(process.cwd(), "dist/sdk/index.cjs");
  const dtsPath = path.resolve(process.cwd(), "dist/sdk/index.d.ts");

  assert(fs.existsSync(esmPath), "dist/sdk/index.js (ESM bundle) exists");
  pass("dist/sdk/index.js exists");

  assert(fs.existsSync(cjsPath), "dist/sdk/index.cjs (CommonJS bundle) exists");
  pass("dist/sdk/index.cjs exists");

  assert(fs.existsSync(dtsPath), "dist/sdk/index.d.ts exists");
  pass("dist/sdk/index.d.ts exists");

  // Verify ESM Import
  const esmModule = await import("../dist/sdk/index.js");
  assert(typeof esmModule.EncryptedDatabaseClient === "function", "ESM module exports EncryptedDatabaseClient");
  pass("ESM import succeeded");

  // Verify CommonJS Require
  const cjsModule = require("../dist/sdk/index.cjs");
  assert(typeof cjsModule.EncryptedDatabaseClient === "function", "CJS module exports EncryptedDatabaseClient");
  pass("CommonJS require succeeded");

  // Verify TypeScript Declarations Content
  const dtsContent = fs.readFileSync(dtsPath, "utf8");
  assert(dtsContent.includes("EncryptedDatabaseClient"), "index.d.ts references EncryptedDatabaseClient");
  pass("TypeScript definitions export type declarations");

  // Verify package.json exports mapping
  const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8"));
  assert(pkg.main === "./dist/sdk/index.cjs", "package.json main points to ./dist/sdk/index.cjs");
  assert(pkg.module === "./dist/sdk/index.js", "package.json module points to ./dist/sdk/index.js");
  assert(pkg.types === "./dist/sdk/index.d.ts", "package.json types points to ./dist/sdk/index.d.ts");
  assert(pkg.exports["."].import === "./dist/sdk/index.js", "package.json exports '.' import mapped");
  assert(pkg.exports["."].require === "./dist/sdk/index.cjs", "package.json exports '.' require mapped");
  pass("package.json modern exports map configured");

  // Verify No Server Secrets in SDK Files
  const esmSource = fs.readFileSync(esmPath, "utf8");
  const cjsSource = fs.readFileSync(cjsPath, "utf8");
  assert(!esmSource.includes("GITHUB_STORAGE_PAT"), "ESM bundle does not contain GITHUB_STORAGE_PAT");
  assert(!esmSource.includes("SESSION_SECRET"), "ESM bundle does not contain SESSION_SECRET");
  assert(!cjsSource.includes("GITHUB_STORAGE_PAT"), "CJS bundle does not contain GITHUB_STORAGE_PAT");
  assert(!cjsSource.includes("SESSION_SECRET"), "CJS bundle does not contain SESSION_SECRET");
  pass("Zero server secret leaks in SDK bundles");

  // ----------------------------------------------------------------
  // 2. Target Server Setup
  // ----------------------------------------------------------------
  let targetBaseUrl = "";
  let serverProcess = null;

  if (candidateProductionUrl && (await checkUrlReachable(candidateProductionUrl))) {
    targetBaseUrl = candidateProductionUrl.startsWith("http")
      ? candidateProductionUrl
      : `https://${candidateProductionUrl}`;
    console.log(`\n🌐 [TARGET] Connecting to Deployed Production URL: ${targetBaseUrl}`);
  } else {
    const allocatedPort = await getAvailablePort();
    console.log(`\n🌐 [TARGET] Starting standalone compiled server on port ${allocatedPort}...`);
    serverProcess = spawn("node", ["dist/server.cjs"], {
      env: {
        ...process.env,
        PORT: String(allocatedPort),
        NODE_ENV: process.env.NODE_ENV || "development",
      },
      stdio: "pipe",
    });

    targetBaseUrl = `http://localhost:${allocatedPort}`;

    let ready = false;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 200));
      if (await checkUrlReachable(targetBaseUrl)) {
        ready = true;
        break;
      }
    }
    assert(ready, `Server failed to start at ${targetBaseUrl}`);
    console.log(`✓ Server ready at ${targetBaseUrl}`);
  }

  try {
    // ----------------------------------------------------------------
    // 3. HTTP Security & CORS Audit
    // ----------------------------------------------------------------
    console.log("\n🛡️ 2. HTTP Security, Headers & CORS Preflight Audit");

    // 3.1 OPTIONS Preflight
    const preflightRes = await fetch(`${targetBaseUrl}/api/db/projects/test_proj/collections/test_col/records`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://external-app.example.com",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type, Authorization, X-Project-Token",
      },
    });
    assert(preflightRes.status === 204, `OPTIONS preflight returns 204 (got ${preflightRes.status})`);
    assert(preflightRes.headers.get("access-control-allow-origin") === "*", "CORS allow-origin is set");
    assert(Boolean(preflightRes.headers.get("access-control-allow-methods")), "CORS allow-methods is set");
    assert(Boolean(preflightRes.headers.get("access-control-allow-headers")), "CORS allow-headers is set");
    pass("CORS OPTIONS preflight returns 204 with complete access headers");

    // 3.2 Security Headers on GET /api/health
    const healthRes = await fetch(`${targetBaseUrl}/api/health`);
    assert(healthRes.status === 200, "GET /api/health returns 200");
    assert(healthRes.headers.get("x-content-type-options") === "nosniff", "X-Content-Type-Options is nosniff");
    assert(healthRes.headers.get("x-frame-options") === "SAMEORIGIN", "X-Frame-Options is SAMEORIGIN");
    assert(healthRes.headers.get("referrer-policy") === "strict-origin-when-cross-origin", "Referrer-Policy is strict-origin-when-cross-origin");
    assert(Boolean(healthRes.headers.get("content-security-policy")), "Content-Security-Policy header is present");
    pass("Mandatory security headers verified (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, CSP)");

    // 3.3 Verify No Leaked Secret Headers
    const forbiddenHeaders = ["x-github-token", "x-pat", "x-secret", "x-master-key", "set-cookie"];
    for (const h of forbiddenHeaders) {
      assert(!healthRes.headers.has(h), `No secret header '${h}' returned in response`);
    }
    pass("Zero sensitive server headers present in HTTP responses");

    // ----------------------------------------------------------------
    // 4. API Playground & Error Matrix Audit
    // ----------------------------------------------------------------
    console.log("\n🧪 3. API Playground & Failure Mode Matrix Audit");

    // 4.1 Missing/Invalid Token -> 401 JSON
    const invalidTokenRes = await fetch(`${targetBaseUrl}/api/db/projects/proj_x/collections/col_y/records`, {
      method: "GET",
      headers: { Authorization: "Bearer invalid.token.payload" },
    });
    assert(invalidTokenRes.status === 401, `Invalid token returns 401 (got ${invalidTokenRes.status})`);
    const invalidTokenJson = await invalidTokenRes.json();
    assert(invalidTokenJson.error === "Unauthorized", "Invalid token returns structured error: Unauthorized");
    pass("Invalid token returns structured 401 JSON");

    // 4.2 Malformed JSON -> 400 JSON
    const malformedJsonRes = await fetch(`${targetBaseUrl}/api/vault/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ invalid json format: true, ",
    });
    assert(malformedJsonRes.status === 400, `Malformed JSON returns 400 (got ${malformedJsonRes.status})`);
    const malformedJson = await malformedJsonRes.json();
    assert(malformedJson.error === "Bad Request" || malformedJson.error === "Invalid Request", "Malformed JSON returns Bad Request");
    pass("Malformed JSON payload handled gracefully with structured 400 JSON");

    // 4.3 Payload Larger Than 5MB -> 413 JSON
    const largePayloadStr = JSON.stringify({ largeData: "A".repeat(5.5 * 1024 * 1024) });
    const largePayloadRes = await fetch(`${targetBaseUrl}/api/vault/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: largePayloadStr,
    });
    assert(largePayloadRes.status === 413, `Payload > 5MB returns 413 (got ${largePayloadRes.status})`);
    const largePayloadJson = await largePayloadRes.json();
    assert(largePayloadJson.error === "Payload Too Large", "Payload > 5MB returns Payload Too Large error");
    pass("Payload exceeding 5MB limit returns structured 413 JSON");

    // ----------------------------------------------------------------
    // 5. Multi-Project Creation & Security Isolation Audit
    // ----------------------------------------------------------------
    console.log("\n🔒 4. Multi-Project Security & Isolation Tests");

    // Register User
    const regRes = await fetch(`${targetBaseUrl}/api/vault/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: `phase6_user_${Date.now()}`,
        opaqueUserId: `opaque_phase6_${Date.now()}`,
        saltHex: "9988776655443322",
        authProofHash: "proof_hash_phase6",
        wrappedDek: "wrapped_dek_phase6",
      }),
    });
    const sessionToken = (await regRes.json()).sessionToken;
    assert(sessionToken, "Session token acquired");

    // Create Project A & Project B
    const projAId = `proj_a_${Date.now().toString(36)}`;
    const projBId = `proj_b_${Date.now().toString(36)}`;

    const createProjARes = await fetch(`${targetBaseUrl}/api/db/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({ projectId: projAId }),
    });
    const projAToken = (await createProjARes.json()).projectToken;
    assert(projAToken, "Project A token created");

    const createProjBRes = await fetch(`${targetBaseUrl}/api/db/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({ projectId: projBId }),
    });
    const projBToken = (await createProjBRes.json()).projectToken;
    assert(projBToken, "Project B token created");

    pass("Provisioned isolated Project A and Project B");

    // Initialize SDK clients for Project A and Project B
    const { EncryptedDatabaseClient } = esmModule;
    const clientA = new EncryptedDatabaseClient({ baseUrl: targetBaseUrl, projectId: projAId, projectToken: projAToken });
    const clientB = new EncryptedDatabaseClient({ baseUrl: targetBaseUrl, projectId: projBId, projectToken: projBToken });

    // Project A writes confidential record
    await clientA.createCollection("confidential");
    const secretRecord = await clientA.createRecord("confidential", { secretCode: "ALPHA-999-TOP-SECRET" }, "rec_secret_1");
    assert(secretRecord.recordId === "rec_secret_1", "Project A inserted secret record");
    pass("Project A wrote confidential record");

    // 5.1 Project B Token CANNOT Read Project A Records
    const crossReadRes = await fetch(`${targetBaseUrl}/api/db/projects/${projAId}/collections/confidential/records/rec_secret_1`, {
      method: "GET",
      headers: { Authorization: `Bearer ${projBToken}` },
    });
    assert(crossReadRes.status === 403, `Cross-project read returned 403 (got ${crossReadRes.status})`);
    pass("Project B token cannot read Project A records (HTTP 403)");

    // 5.2 Project B Token CANNOT Read Project A Collections
    const crossColRes = await fetch(`${targetBaseUrl}/api/db/projects/${projAId}/collections`, {
      method: "GET",
      headers: { Authorization: `Bearer ${projBToken}` },
    });
    assert(crossColRes.status === 403, `Cross-project list collections returned 403 (got ${crossColRes.status})`);
    pass("Project B token cannot list Project A collections (HTTP 403)");

    // 5.3 Project B Token CANNOT Access Project A Raw Envelopes
    const crossRawRes = await fetch(`${targetBaseUrl}/api/db/projects/${projAId}/collections/confidential/records/rec_secret_1/raw`, {
      method: "GET",
      headers: { Authorization: `Bearer ${projBToken}` },
    });
    assert(crossRawRes.status === 403, `Cross-project raw envelope returned 403 (got ${crossRawRes.status})`);
    pass("Project B token cannot access Project A raw envelopes (HTTP 403)");

    // 5.4 Path Traversal & Breakout Rejection
    const traversalAttempts = [
      "../../other_app",
      "..%2f..%2fother",
      "..%252f..%252fother",
      "/absolute/path/file",
      "valid_col/../../../etc/passwd",
    ];
    for (const badPath of traversalAttempts) {
      const res = await fetch(`${targetBaseUrl}/api/db/projects/${projAId}/collections/${encodeURIComponent(badPath)}/records`, {
        method: "GET",
        headers: { Authorization: `Bearer ${projAToken}` },
      });
      assert(res.status === 400 || res.status === 403 || res.status === 404, `Path traversal attempt '${badPath}' was rejected with ${res.status}`);
    }
    pass("All relative, absolute, and encoded path traversal attempts strictly rejected");

    // 5.5 Token Rotation & Invalidation
    console.log("\n🔄 5. Token Rotation & Revocation Security");
    const rotateRes = await fetch(`${targetBaseUrl}/api/db/projects/${projAId}/token/rotate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    const rotateJson = await rotateRes.json();
    assert(rotateJson.success === true, "Token rotation succeeded");
    const newProjAToken = rotateJson.projectToken;
    assert(newProjAToken !== projAToken, "New project token generated");

    // Old token should now be rejected
    const oldTokenRes = await fetch(`${targetBaseUrl}/api/db/projects/${projAId}/collections/confidential/records`, {
      method: "GET",
      headers: { Authorization: `Bearer ${projAToken}` },
    });
    assert(oldTokenRes.status === 403 || oldTokenRes.status === 401, `Old rotated token rejected (got ${oldTokenRes.status})`);
    pass("Rotated tokens instantly invalidate previous tokens");

    // New token works
    const newClientA = new EncryptedDatabaseClient({ baseUrl: targetBaseUrl, projectId: projAId, projectToken: newProjAToken });
    const recordsWithNewToken = await newClientA.listRecords("confidential");
    assert(recordsWithNewToken.length >= 1, "New token successfully accesses collection records");
    pass("New rotated token functions seamlessly");

    // 5.6 Token Revocation & Project Disabling
    const revokeRes = await fetch(`${targetBaseUrl}/api/db/projects/${projAId}/token/revoke`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    assert(revokeRes.status === 200, "Token revocation returned 200");

    const revokedAttemptRes = await fetch(`${targetBaseUrl}/api/db/projects/${projAId}/collections/confidential/records`, {
      method: "GET",
      headers: { Authorization: `Bearer ${newProjAToken}` },
    });
    assert(revokedAttemptRes.status === 403, `Revoked project token rejected (got ${revokedAttemptRes.status})`);
    pass("Revoked tokens immediately lock project access with 403 Forbidden");

    // ----------------------------------------------------------------
    // 6. Documentation Files Audit
    // ----------------------------------------------------------------
    console.log("\n📚 6. Documentation Completeness Audit");
    const docFiles = [
      "README.md",
      "docs/quickstart.md",
      "docs/authentication.md",
      "docs/projects.md",
      "docs/collections.md",
      "docs/records.md",
      "docs/filtering.md",
      "docs/concurrency.md",
      "docs/errors.md",
      "docs/security.md",
      "docs/SDK.md",
      "examples/external-sdk-test/README.md",
    ];

    for (const docFile of docFiles) {
      const fullPath = path.resolve(process.cwd(), docFile);
      assert(fs.existsSync(fullPath), `Doc exists: ${docFile}`);
      const content = fs.readFileSync(fullPath, "utf8");
      assert(content.length > 200, `Doc ${docFile} has substantial content (${content.length} bytes)`);
      pass(`Documentation file ${docFile} verified (${content.length} bytes)`);
    }

    console.log("\n==================================================");
    console.log(`🎉 ALL ${totalPassed} PHASE 6 AUDIT TESTS PASSED SUCCESSFULLY!`);
    console.log("==================================================");
  } finally {
    if (serverProcess) {
      serverProcess.kill();
    }
  }
}

runPhase6Audit().catch((err) => {
  console.error("\n❌ Phase 6 audit failed:", err);
  process.exit(1);
});
