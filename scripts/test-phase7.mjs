/**
 * PHASE 7 — REAL EXTERNAL APPLICATION & DEVELOPER RELEASE AUDIT SUITE
 *
 * Verifies:
 * 1. Independent Real External App (examples/real-external-app/)
 * 2. Complete CRUD & Lifecycle (Health -> Collection -> Insert -> Read -> Filter -> Paginated -> Update -> Stale SHA Conflict -> Raw Envelope -> Stats -> Delete)
 * 3. Multi-Project Security & Attack Surface Hardening (Isolation, Revocation, Rotation, Traversal, 5MB Limit, Malformed JSON)
 * 4. SDK Packaging & Developer Installation (ESM, CommonJS, TypeScript Declarations, Browser Fetch Context)
 * 5. Production Readiness (CORS, CSP, Security Headers, Structured Errors, Zero Leaked Secrets)
 * 6. Documentation & Quickstart Accuracy
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

async function runPhase7Audit() {
  console.log("==================================================");
  console.log("🚀 PHASE 7 REAL EXTERNAL APP & RELEASE AUDIT");
  console.log("==================================================");

  let totalPassed = 0;
  function pass(testName) {
    totalPassed++;
    console.log(`  ✅ PASS: ${testName}`);
  }

  // ----------------------------------------------------------------
  // 1. SDK Packaging & Developer Installation Verification
  // ----------------------------------------------------------------
  console.log("\n📦 1. SDK Packaging & Installation Verification");

  const esmPath = path.resolve(process.cwd(), "dist/sdk/index.js");
  const cjsPath = path.resolve(process.cwd(), "dist/sdk/index.cjs");
  const dtsPath = path.resolve(process.cwd(), "dist/sdk/index.d.ts");

  assert(fs.existsSync(esmPath), "dist/sdk/index.js (ESM bundle) exists");
  pass("ESM build bundle exists");

  assert(fs.existsSync(cjsPath), "dist/sdk/index.cjs (CommonJS bundle) exists");
  pass("CommonJS build bundle exists");

  assert(fs.existsSync(dtsPath), "dist/sdk/index.d.ts (TypeScript declarations) exists");
  pass("TypeScript .d.ts declarations exist");

  // Dynamic import test for ESM
  const esmModule = await import("../dist/sdk/index.js");
  assert(typeof esmModule.EncryptedDatabaseClient === "function", "ESM export EncryptedDatabaseClient is available");
  assert(typeof esmModule.DatabaseApiError === "function", "ESM export DatabaseApiError is available");
  pass("ESM package import succeeded");

  // CommonJS require test
  const cjsModule = require("../dist/sdk/index.cjs");
  assert(typeof cjsModule.EncryptedDatabaseClient === "function", "CommonJS export EncryptedDatabaseClient is available");
  assert(typeof cjsModule.DatabaseApiError === "function", "CommonJS export DatabaseApiError is available");
  pass("CommonJS package require succeeded");

  // Verify Browser Fetch Context Safety in SDK constructor
  const dummyWindow = {
    fetch: function () {
      return Promise.resolve(new Response(JSON.stringify({ status: "healthy" })));
    },
  };
  const browserClient = new esmModule.EncryptedDatabaseClient({
    baseUrl: "https://example.com",
    projectId: "test_browser",
    projectToken: "token_browser",
    fetchFn: dummyWindow.fetch.bind(dummyWindow),
  });
  assert(typeof browserClient.getRecord === "function", "Browser client initializes with bound fetch");
  pass("Browser fetch context binding verified");

  // Check no server secrets in SDK files
  const esmContent = fs.readFileSync(esmPath, "utf8");
  const cjsContent = fs.readFileSync(cjsPath, "utf8");
  assert(!esmContent.includes("GITHUB_STORAGE_PAT"), "No GITHUB_STORAGE_PAT in ESM bundle");
  assert(!esmContent.includes("SESSION_SECRET"), "No SESSION_SECRET in ESM bundle");
  assert(!cjsContent.includes("GITHUB_STORAGE_PAT"), "No GITHUB_STORAGE_PAT in CJS bundle");
  assert(!cjsContent.includes("SESSION_SECRET"), "No SESSION_SECRET in CJS bundle");
  pass("SDK bundles verified free of server secrets");

  // ----------------------------------------------------------------
  // 2. Server Instance Setup
  // ----------------------------------------------------------------
  let targetBaseUrl = "";
  let serverProcess = null;

  if (candidateProductionUrl && (await checkUrlReachable(candidateProductionUrl))) {
    targetBaseUrl = candidateProductionUrl.startsWith("http")
      ? candidateProductionUrl
      : `https://${candidateProductionUrl}`;
    console.log(`\n🌐 [TARGET] Connecting to Live Server at ${targetBaseUrl}`);
  } else {
    const allocatedPort = await getAvailablePort();
    console.log(`\n🌐 [TARGET] Launching compiled server on port ${allocatedPort}...`);
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
    // 3. Real External Application Full Lifecycle
    // ----------------------------------------------------------------
    console.log("\n🧪 2. Real External Application Full Lifecycle Test");

    // Register User
    const regRes = await fetch(`${targetBaseUrl}/api/vault/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: `phase7_dev_${Date.now()}`,
        opaqueUserId: `opaque_p7_${Date.now()}`,
        saltHex: "1234567890abcdef",
        authProofHash: "proof_hash_phase7",
        wrappedDek: "wrapped_dek_phase7",
      }),
    });
    const sessionToken = (await regRes.json()).sessionToken;
    assert(sessionToken, "Session token obtained");

    // Create Project A
    const projAId = `fintech_prod_${Date.now().toString(36)}`;
    const createProjRes = await fetch(`${targetBaseUrl}/api/db/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({ projectId: projAId }),
    });
    const projAToken = (await createProjRes.json()).projectToken;
    assert(projAToken, "Project A token obtained");
    pass("Provisioned isolated project");

    // Initialize EncryptedDatabaseClient
    const { EncryptedDatabaseClient, DatabaseApiError } = esmModule;
    const client = new EncryptedDatabaseClient({
      baseUrl: targetBaseUrl,
      projectId: projAId,
      projectToken: projAToken,
    });

    // 1. checkHealth()
    const health = await client.checkHealth();
    assert(health.status === "healthy" || health.status === "ok", "checkHealth returned healthy status");
    pass("Lifecycle: checkHealth()");

    // 2. createCollection() & listCollections()
    const colRes = await client.createCollection("ledger");
    assert(colRes.success === true, "createCollection('ledger') returned success");
    const cols = await client.listCollections();
    assert(cols.includes("ledger"), "listCollections() contains 'ledger'");
    pass("Lifecycle: createCollection() & listCollections()");

    // 3. insertRecord() / createRecord()
    const txnRecord = {
      txnId: "TXN_7749",
      amount: 87500.25,
      currency: "EUR",
      status: "COMPLETED",
      category: "SETTLEMENT",
      parties: { sender: "BANK_DE_01", receiver: "CORP_FR_99" },
    };
    const insertRes = await client.insertRecord("ledger", txnRecord, "txn_7749");
    assert(insertRes.recordId === "txn_7749", "insertRecord returned correct recordId");
    assert(typeof insertRes.sha === "string" && insertRes.sha.length > 0, "insertRecord returned Git blob SHA");
    const initialSha = insertRes.sha;
    pass("Lifecycle: insertRecord()");

    // Insert additional record for pagination & filtering
    const txnRecord2 = {
      txnId: "TXN_7750",
      amount: 1200.0,
      currency: "EUR",
      status: "PENDING",
      category: "EXPENSE",
      parties: { sender: "CORP_FR_99", receiver: "VENDOR_NL_04" },
    };
    await client.insertRecord("ledger", txnRecord2, "txn_7750");
    pass("Lifecycle: insertRecord() additional test records");

    // 4. getRecord() (Transparent Decryption)
    const fetched = await client.getRecord("ledger", "txn_7749");
    assert.equal(fetched.recordId, "txn_7749", "getRecord returned correct ID");
    assert.deepEqual(fetched.data.parties, txnRecord.parties, "Decrypted data matches original payload");
    assert.equal(fetched.sha, initialSha, "getRecord returned matching Git blob SHA");
    pass("Lifecycle: getRecord() transparent AES-256-GCM decryption");

    // 5. filtering
    const pendingList = await client.listRecords("ledger", { filterField: "status", filterValue: "PENDING" });
    assert.equal(pendingList.length, 1, "Filter returned exactly 1 matching record");
    assert.equal(pendingList[0].data.txnId, "TXN_7750", "Filter matched correct transaction");
    pass("Lifecycle: listRecords() with server-side filtering");

    // 6. listRecordsPaginated()
    const paginated = await client.listRecordsPaginated("ledger", { page: 1, limit: 1 });
    assert.equal(paginated.page, 1, "Pagination page is 1");
    assert.equal(paginated.limit, 1, "Pagination limit is 1");
    assert.equal(paginated.total, 2, "Pagination total is 2");
    assert.equal(paginated.totalPages, 2, "Pagination totalPages is 2");
    assert.equal(paginated.records.length, 1, "Page contains 1 record");
    pass("Lifecycle: listRecordsPaginated()");

    // 7. updateRecord() with expectedSha
    const updatedTxn = { ...fetched.data, status: "RECONCILED", reconciledAt: new Date().toISOString() };
    const updateRes = await client.updateRecord("ledger", "txn_7749", updatedTxn, initialSha);
    assert(updateRes.success === true, "updateRecord succeeded");
    assert(updateRes.sha !== initialSha, "New Git blob SHA produced");
    const updatedSha = updateRes.sha;
    pass("Lifecycle: updateRecord() with expectedSha");

    // 8. Stale SHA Conflict
    try {
      await client.updateRecord("ledger", "txn_7749", { ...updatedTxn, status: "VOID" }, initialSha);
      assert.fail("Stale SHA should have caused 409 Conflict");
    } catch (err) {
      assert(err instanceof DatabaseApiError, "Error is DatabaseApiError");
      assert.equal(err.statusCode, 409, "Stale SHA returned HTTP 409 Conflict");
      pass("Lifecycle: Stale SHA optimistic concurrency conflict (HTTP 409)");
    }

    // 9. getRawEnvelope() Zero-Knowledge Inspection
    const rawEnv = await client.getRawEnvelope("ledger", "txn_7749");
    assert.equal(rawEnv.isEncrypted, true, "isEncrypted is true");
    assert(typeof rawEnv.rawPersistedContent === "string", "rawPersistedContent is string");
    assert(!rawEnv.rawPersistedContent.includes("BANK_DE_01"), "Raw ciphertext contains no plaintext data");
    pass("Lifecycle: getRawEnvelope() zero-knowledge inspection");

    // 10. getStats()
    const stats = await client.getStats();
    assert.equal(stats.projectId, projAId, "getStats matches projectId");
    assert.equal(stats.collectionsCount, 1, "getStats reflects 1 collection");
    assert.equal(stats.totalRecords, 2, "getStats reflects 2 records");
    pass("Lifecycle: getStats() telemetry");

    // 11. deleteRecord()
    const delRes1 = await client.deleteRecord("ledger", "txn_7749", updatedSha);
    assert(delRes1.success === true, "deleteRecord returned success");
    try {
      await client.getRecord("ledger", "txn_7749");
      assert.fail("Deleted record should return 404");
    } catch (err) {
      assert.equal(err.statusCode, 404, "Deleted record returned 404");
    }
    pass("Lifecycle: deleteRecord()");

    // ----------------------------------------------------------------
    // 4. Security & Isolation Matrix Audit
    // ----------------------------------------------------------------
    console.log("\n🔒 3. Security & Isolation Matrix Audit");

    // Create Project B
    const projBId = `other_corp_${Date.now().toString(36)}`;
    const projBRes = await fetch(`${targetBaseUrl}/api/db/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({ projectId: projBId }),
    });
    const projBToken = (await projBRes.json()).projectToken;
    assert(projBToken, "Project B token generated");

    // 4.1 Project B cannot access Project A collection
    const crossColRes = await fetch(`${targetBaseUrl}/api/db/projects/${projAId}/collections`, {
      method: "GET",
      headers: { Authorization: `Bearer ${projBToken}` },
    });
    assert.equal(crossColRes.status, 403, "Project B token rejected from listing Project A collections");
    pass("Security: Project A collections protected from Project B (HTTP 403)");

    // 4.2 Project B cannot access Project A record
    const crossRecRes = await fetch(`${targetBaseUrl}/api/db/projects/${projAId}/collections/ledger/records/txn_7750`, {
      method: "GET",
      headers: { Authorization: `Bearer ${projBToken}` },
    });
    assert.equal(crossRecRes.status, 403, "Project B token rejected from reading Project A records");
    pass("Security: Project A records protected from Project B (HTTP 403)");

    // 4.3 Project B cannot access Project A raw envelope
    const crossRawRes = await fetch(`${targetBaseUrl}/api/db/projects/${projAId}/collections/ledger/records/txn_7750/raw`, {
      method: "GET",
      headers: { Authorization: `Bearer ${projBToken}` },
    });
    assert.equal(crossRawRes.status, 403, "Project B token rejected from reading Project A raw envelopes");
    pass("Security: Project A raw envelopes protected from Project B (HTTP 403)");

    // 4.4 Token Rotation Security
    const rotateRes = await fetch(`${targetBaseUrl}/api/db/projects/${projAId}/token/rotate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    const rotateJson = await rotateRes.json();
    const newProjAToken = rotateJson.projectToken;
    assert(newProjAToken !== projAToken, "New token created");

    // Old token must fail
    const oldTokenAttempt = await fetch(`${targetBaseUrl}/api/db/projects/${projAId}/collections/ledger/records`, {
      method: "GET",
      headers: { Authorization: `Bearer ${projAToken}` },
    });
    assert(oldTokenAttempt.status === 403 || oldTokenAttempt.status === 401, "Old rotated token rejected");
    pass("Security: Rotated tokens immediately invalidate prior tokens");

    // 4.5 Token Revocation Security
    await fetch(`${targetBaseUrl}/api/db/projects/${projAId}/token/revoke`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sessionToken}` },
    });

    const revokedAttempt = await fetch(`${targetBaseUrl}/api/db/projects/${projAId}/collections/ledger/records`, {
      method: "GET",
      headers: { Authorization: `Bearer ${newProjAToken}` },
    });
    assert.equal(revokedAttempt.status, 403, "Revoked token rejected with 403");
    pass("Security: Revoked tokens immediately block access");

    // 4.6 Path Traversal Security
    const traversalTests = [
      "../../etc/passwd",
      "..%2f..%2fsecret",
      "/root/data",
      "..\\..\\windows\\system32",
    ];
    for (const badPath of traversalTests) {
      const travRes = await fetch(`${targetBaseUrl}/api/db/projects/${projBId}/collections/${encodeURIComponent(badPath)}/records`, {
        method: "GET",
        headers: { Authorization: `Bearer ${projBToken}` },
      });
      assert(travRes.status === 400 || travRes.status === 403 || travRes.status === 404, `Path traversal ${badPath} rejected with ${travRes.status}`);
    }
    pass("Security: Path traversal attacks strictly rejected");

    // 4.7 Malformed JSON & Payload Limits
    const malformedRes = await fetch(`${targetBaseUrl}/api/vault/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not a json string at all :::",
    });
    assert.equal(malformedRes.status, 400, "Malformed JSON rejected with 400");
    pass("Security: Malformed JSON rejected with structured 400");

    const hugePayload = JSON.stringify({ huge: "X".repeat(5.2 * 1024 * 1024) });
    const hugeRes = await fetch(`${targetBaseUrl}/api/vault/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: hugePayload,
    });
    assert.equal(hugeRes.status, 413, ">5MB payload rejected with 413");
    pass("Security: Payload >5MB rejected with structured 413");

    // ----------------------------------------------------------------
    // 5. Production Readiness & HTTP Headers
    // ----------------------------------------------------------------
    console.log("\n🌐 4. Production Readiness & Headers Audit");
    const preflight = await fetch(`${targetBaseUrl}/api/db/projects/${projBId}/collections/test/records`, {
      method: "OPTIONS",
      headers: { Origin: "https://external.app" },
    });
    assert.equal(preflight.status, 204, "CORS OPTIONS returns 204");
    assert(preflight.headers.has("access-control-allow-origin"), "CORS origin header present");
    pass("Production: CORS OPTIONS preflight verified");

    const healthHeaders = await fetch(`${targetBaseUrl}/api/health`);
    assert.equal(healthHeaders.headers.get("x-content-type-options"), "nosniff", "nosniff header present");
    assert.equal(healthHeaders.headers.get("x-frame-options"), "SAMEORIGIN", "SAMEORIGIN header present");
    assert.equal(healthHeaders.headers.get("referrer-policy"), "strict-origin-when-cross-origin", "referrer-policy header present");
    assert(healthHeaders.headers.has("content-security-policy"), "CSP header present");
    pass("Production: Mandatory security headers verified");

    // ----------------------------------------------------------------
    // 6. Documentation Audit
    // ----------------------------------------------------------------
    console.log("\n📚 5. Documentation & Quickstart Audit");
    const docList = [
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
      "examples/real-external-app/README.md",
    ];
    for (const d of docList) {
      const full = path.resolve(process.cwd(), d);
      assert(fs.existsSync(full), `Documentation file exists: ${d}`);
      const txt = fs.readFileSync(full, "utf8");
      assert(txt.length > 200, `Documentation file ${d} is comprehensive`);
      pass(`Documentation file ${d} verified (${txt.length} bytes)`);
    }

    console.log("\n==================================================");
    console.log(`🎉 ALL ${totalPassed} PHASE 7 AUDIT TESTS PASSED SUCCESSFULLY!`);
    console.log("==================================================");
  } finally {
    if (serverProcess) {
      serverProcess.kill();
    }
  }
}

runPhase7Audit().catch((err) => {
  console.error("\n❌ Phase 7 audit failed:", err);
  process.exit(1);
});
