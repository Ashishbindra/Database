import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { createServer } from "node:net";

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
    const res = await fetch(`${url}/api/health`, { method: "GET", signal: AbortSignal.timeout(3000) });
    if (res.status !== 200) return false;
    const data = await res.json();
    return data && (data.ok === true || data.status === "healthy" || data.status === "ok");
  } catch {
    return false;
  }
}

async function runTest() {
  console.log("==================================================");
  console.log("🧪 REAL EXTERNAL APPLICATION AUTOMATED TEST SUITE");
  console.log("==================================================");

  let targetBaseUrl = process.env.DATABASE_URL || "";
  let serverProcess = null;

  if (targetBaseUrl && (await checkUrlReachable(targetBaseUrl))) {
    console.log(`[TARGET] Using provided live database URL: ${targetBaseUrl}`);
  } else {
    const port = await getAvailablePort();
    console.log(`[TARGET] Starting local test database server on port ${port}...`);
    serverProcess = spawn("node", ["dist/server.cjs"], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(port), NODE_ENV: "development" },
      stdio: "pipe",
    });

    targetBaseUrl = `http://localhost:${port}`;
    let ready = false;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 200));
      if (await checkUrlReachable(targetBaseUrl)) {
        ready = true;
        break;
      }
    }
    if (!ready) {
      throw new Error(`Test server failed to start at ${targetBaseUrl}`);
    }
    console.log(`✓ Test server running at ${targetBaseUrl}`);
  }

  try {
    // 1. Provision Test Project
    console.log("\n1. Provisioning Test Project for Real External App...");
    const regRes = await fetch(`${targetBaseUrl}/api/vault/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: `real_ext_user_${Date.now()}`,
        opaqueUserId: `real_ext_opaque_${Date.now()}`,
        saltHex: "1133557799bbddff",
        authProofHash: "proof_hash_real_ext",
        wrappedDek: "wrapped_dek_real_ext",
      }),
    });
    const sessionToken = (await regRes.json()).sessionToken;
    assert(sessionToken, "Session token obtained");

    const projectId = `real_ext_${Date.now().toString(36)}`;
    const projRes = await fetch(`${targetBaseUrl}/api/db/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ projectId }),
    });
    const projectToken = (await projRes.json()).projectToken;
    assert(projectToken, "Project token obtained");

    // 2. Import SDK Package
    console.log("\n2. Importing SDK Package...");
    let sdkModule;
    try {
      sdkModule = await import("github-encrypted-storage-sdk");
    } catch {
      sdkModule = await import("../../../dist/sdk/index.js");
    }
    const { EncryptedDatabaseClient, DatabaseApiError } = sdkModule;

    // 3. Initialize SDK
    console.log("\n3. Initializing EncryptedDatabaseClient...");
    const db = new EncryptedDatabaseClient({
      baseUrl: targetBaseUrl,
      projectId,
      projectToken,
    });

    // 4. checkHealth()
    console.log("\n4. Checking Health...");
    const health = await db.checkHealth();
    assert(health.status === "healthy" || health.status === "ok", "Service health check passed");
    console.log("  ✓ checkHealth() passed");

    // 5. createCollection() & listCollections()
    console.log("\n5. Managing Collections...");
    const colRes = await db.createCollection("audit_logs");
    assert(colRes.success === true, "createCollection succeeded");
    const collections = await db.listCollections();
    assert(collections.includes("audit_logs"), "listCollections includes audit_logs");
    console.log("  ✓ Collection operations passed");

    // 6. insertRecord()
    console.log("\n6. Inserting Records...");
    const event1 = {
      eventId: "evt_001",
      eventType: "PAYMENT_PROCESSED",
      severity: "INFO",
      actorEmail: "billing@fintech.io",
      amount: 50000,
    };
    const event2 = {
      eventId: "evt_002",
      eventType: "KEY_ROTATION",
      severity: "CRITICAL",
      actorEmail: "security@fintech.io",
      amount: 0,
    };
    const insertRes1 = await db.insertRecord("audit_logs", event1, "evt_001");
    const insertRes2 = await db.insertRecord("audit_logs", event2, "evt_002");
    assert(insertRes1.recordId === "evt_001", "insertRecord 1 returned evt_001");
    assert(insertRes2.recordId === "evt_002", "insertRecord 2 returned evt_002");
    assert(typeof insertRes1.sha === "string" && insertRes1.sha.length > 0, "insertRecord returned Git blob SHA");
    console.log("  ✓ insertRecord() passed");

    // 7. getRecord()
    console.log("\n7. Retrieving Decrypted Record...");
    const fetched = await db.getRecord("audit_logs", "evt_001");
    assert.equal(fetched.data.eventType, "PAYMENT_PROCESSED", "Decrypted payload matches");
    assert.equal(fetched.data.amount, 50000, "Decrypted amount matches");
    assert.equal(fetched.sha, insertRes1.sha, "SHA matches");
    console.log("  ✓ getRecord() passed");

    // 8. filtering
    console.log("\n8. Querying with Filtering...");
    const criticalRecords = await db.listRecords("audit_logs", { filterField: "severity", filterValue: "CRITICAL" });
    assert.equal(criticalRecords.length, 1, "Filter returned exactly 1 critical record");
    assert.equal(criticalRecords[0].data.eventId, "evt_002", "Filtered record matches evt_002");
    console.log("  ✓ filtering passed");

    // 9. listRecordsPaginated()
    console.log("\n9. Querying with Pagination...");
    const page1 = await db.listRecordsPaginated("audit_logs", { page: 1, limit: 1 });
    assert.equal(page1.page, 1, "Page is 1");
    assert.equal(page1.limit, 1, "Limit is 1");
    assert.equal(page1.total, 2, "Total is 2");
    assert.equal(page1.totalPages, 2, "Total pages is 2");
    assert.equal(page1.records.length, 1, "Returned 1 record for page 1");
    console.log("  ✓ listRecordsPaginated() passed");

    // 10. updateRecord() with expectedSha
    console.log("\n10. Updating Record with expectedSha...");
    const updatedPayload = { ...fetched.data, status: "settled" };
    const updateRes = await db.updateRecord("audit_logs", "evt_001", updatedPayload, fetched.sha);
    assert(updateRes.success === true, "updateRecord succeeded");
    assert(updateRes.sha !== fetched.sha, "New SHA generated");
    console.log("  ✓ updateRecord() passed");

    // 11. Stale SHA Conflict Test
    console.log("\n11. Testing Stale SHA Conflict (Optimistic Concurrency)...");
    try {
      await db.updateRecord("audit_logs", "evt_001", { ...updatedPayload, status: "void" }, fetched.sha);
      assert.fail("Should have thrown 409 Conflict");
    } catch (err) {
      assert(err instanceof DatabaseApiError, "Error is DatabaseApiError");
      assert.equal(err.statusCode, 409, "Status code is 409 Conflict");
      console.log("  ✓ Stale SHA correctly rejected with HTTP 409");
    }

    // 12. getRawEnvelope()
    console.log("\n12. Inspecting Zero-Knowledge Raw Envelope...");
    const rawEnv = await db.getRawEnvelope("audit_logs", "evt_001");
    assert.equal(rawEnv.isEncrypted, true, "isEncrypted is true");
    assert(!rawEnv.rawPersistedContent.includes("PAYMENT_PROCESSED"), "Raw content is encrypted ciphertext");
    console.log("  ✓ getRawEnvelope() zero-knowledge verified");

    // 13. getStats()
    console.log("\n13. Retrieving Project Stats...");
    const stats = await db.getStats();
    assert.equal(stats.projectId, projectId, "Stats match projectId");
    assert(stats.collectionsCount >= 1, "Collections count >= 1");
    assert(stats.totalRecords >= 2, "Total records >= 2");
    console.log("  ✓ getStats() passed");

    // 14. deleteRecord()
    console.log("\n14. Deleting Records...");
    const delRes1 = await db.deleteRecord("audit_logs", "evt_001", updateRes.sha);
    const delRes2 = await db.deleteRecord("audit_logs", "evt_002", insertRes2.sha);
    assert(delRes1.success === true, "deleteRecord 1 succeeded");
    assert(delRes2.success === true, "deleteRecord 2 succeeded");

    try {
      await db.getRecord("audit_logs", "evt_001");
      assert.fail("Should have thrown 404 for deleted record");
    } catch (err) {
      assert.equal(err.statusCode, 404, "Deleted record returned 404");
    }
    console.log("  ✓ deleteRecord() passed");

    // 15. Security: Secret Exposure Check
    console.log("\n15. Checking for Secret Leaks in Client...");
    const clientStr = JSON.stringify(db);
    assert(!clientStr.includes("GITHUB_STORAGE_PAT"), "Client does not contain GITHUB_STORAGE_PAT");
    assert(!clientStr.includes("SESSION_SECRET"), "Client does not contain SESSION_SECRET");
    console.log("  ✓ Secret isolation passed");

    console.log("\n==================================================");
    console.log("🎉 ALL REAL EXTERNAL APPLICATION TESTS PASSED!");
    console.log("==================================================");
  } finally {
    if (serverProcess) {
      serverProcess.kill();
    }
  }
}

runTest().catch((err) => {
  console.error("\n❌ Real External App test failed:", err);
  process.exit(1);
});
