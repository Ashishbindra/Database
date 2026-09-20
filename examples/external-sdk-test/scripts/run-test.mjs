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
  console.log("🧪 EXTERNAL SDK TEST APPLICATION AUTOMATED TEST SUITE");
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
    // 1. Provision a test project via User Session
    console.log("\n1. Provisioning External Test Project via Admin API...");
    const regRes = await fetch(`${targetBaseUrl}/api/vault/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: `ext_test_user_${Date.now()}`,
        opaqueUserId: `ext_user_id_${Date.now()}`,
        saltHex: "1122334455667788",
        authProofHash: "proof_hash_external_test",
        wrappedDek: "wrapped_dek_external_test",
      }),
    });
    const regData = await regRes.json();
    const sessionToken = regData.sessionToken;
    assert(sessionToken, "Session token acquired for project provisioning");

    const projectId = `ext_test_${Date.now().toString(36)}`;
    const projRes = await fetch(`${targetBaseUrl}/api/db/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ projectId }),
    });
    const projData = await projRes.json();
    assert(projData.success === true, "Project creation succeeded");
    const projectToken = projData.projectToken;
    assert(projectToken, "Project token received for external app");

    // 2. Import SDK Client (Testing Package Resolution)
    console.log("\n2. Importing and Initializing EncryptedDatabaseClient...");
    let sdkModule;
    try {
      sdkModule = await import("github-encrypted-storage-sdk");
    } catch {
      sdkModule = await import("../../../dist/sdk/index.js");
    }
    const { EncryptedDatabaseClient, DatabaseApiError } = sdkModule;

    const client = new EncryptedDatabaseClient({
      baseUrl: targetBaseUrl,
      projectId: projectId,
      projectToken: projectToken,
    });

    // 3. checkHealth()
    console.log("\n3. Testing checkHealth()...");
    const health = await client.checkHealth();
    assert(health.status === "healthy" || health.status === "ok", "checkHealth() returns healthy status");
    console.log("  ✓ checkHealth() passed");

    // 4. createCollection() and listCollections()
    console.log("\n4. Testing Collection Management...");
    const createColRes = await client.createCollection("invoices");
    assert(createColRes.success === true, "createCollection('invoices') succeeded");
    const collections = await client.listCollections();
    assert(collections.includes("invoices"), "listCollections() contains 'invoices'");
    console.log("  ✓ Collection management passed");

    // 5. insertRecord() / createRecord()
    console.log("\n5. Testing createRecord()...");
    const testData = {
      invoiceNumber: "INV-2026-001",
      amount: 14500.50,
      currency: "USD",
      status: "pending",
      items: [
        { desc: "Cloud Security Architecture Consulting", hours: 40, rate: 250 },
        { desc: "Zero-Knowledge Encryption Audit", hours: 18, rate: 250 }
      ]
    };
    const insertRes = await client.createRecord("invoices", testData, "inv_001");
    assert(insertRes.recordId === "inv_001", "insert returned correct recordId");
    assert(typeof insertRes.sha === "string" && insertRes.sha.length > 0, "insert returned Git blob SHA");
    const initialSha = insertRes.sha;
    console.log("  ✓ Record insertion passed");

    // 6. getRecord()
    console.log("\n6. Testing getRecord()...");
    const fetchedRecord = await client.getRecord("invoices", "inv_001");
    assert(fetchedRecord.recordId === "inv_001", "getRecord returned correct recordId");
    assert.deepEqual(fetchedRecord.data.items, testData.items, "getRecord decrypted payload matches original data");
    assert(fetchedRecord.sha === initialSha, "getRecord returned matching Git blob SHA");
    console.log("  ✓ getRecord() transparent decryption passed");

    // 7. getRawEnvelope()
    console.log("\n7. Testing getRawEnvelope()...");
    const rawEnvelope = await client.getRawEnvelope("invoices", "inv_001");
    assert(rawEnvelope.recordId === "inv_001", "getRawEnvelope returned correct recordId");
    assert(rawEnvelope.isEncrypted === true, "rawEnvelope isEncrypted is true");
    assert(typeof rawEnvelope.rawPersistedContent === "string", "rawPersistedContent is string");
    const parsedEnvelope = JSON.parse(rawEnvelope.rawPersistedContent);
    assert(parsedEnvelope.iv && parsedEnvelope.ciphertext && parsedEnvelope.tag, "Envelope contains AES-256-GCM iv, ciphertext, and tag");
    assert(!rawEnvelope.rawPersistedContent.includes("Cloud Security Architecture Consulting"), "Raw envelope does not contain plaintext data");
    console.log("  ✓ getRawEnvelope() zero-knowledge inspection passed");

    // 8. updateRecord() with expectedSha
    console.log("\n8. Testing updateRecord() with optimistic concurrency...");
    const updatedData = {
      ...testData,
      status: "paid",
      paidAt: new Date().toISOString()
    };
    const updateRes = await client.updateRecord("invoices", "inv_001", updatedData, initialSha);
    assert(updateRes.success === true, "updateRecord succeeded");
    assert(updateRes.sha !== initialSha, "updateRecord generated new Git blob SHA");
    const updatedSha = updateRes.sha;

    // Verify update persisted
    const verifyUpdate = await client.getRecord("invoices", "inv_001");
    assert(verifyUpdate.data.status === "paid", "Updated data verified");
    console.log("  ✓ updateRecord() with expectedSha passed");

    // 9. Stale expectedSha Conflict Test
    console.log("\n9. Testing optimistic concurrency conflict rejection...");
    try {
      await client.updateRecord("invoices", "inv_001", { ...updatedData, status: "void" }, initialSha);
      assert.fail("Should have thrown 409 conflict for stale SHA");
    } catch (err) {
      assert(err instanceof DatabaseApiError, "Thrown error is DatabaseApiError");
      assert(err.statusCode === 409, "Error status code is 409 Conflict");
      console.log("  ✓ Optimistic concurrency conflict correctly rejected with HTTP 409");
    }

    // 10. listRecords() and Filtering
    console.log("\n10. Testing listRecords()...");
    const allRecords = await client.listRecords("invoices");
    assert(allRecords.length >= 1, "listRecords returned array of records");
    assert(allRecords.some(r => r.recordId === "inv_001"), "listRecords contains created record");
    console.log("  ✓ listRecords() passed");

    // 11. getStats()
    console.log("\n11. Testing getStats()...");
    const stats = await client.getStats();
    assert(stats.projectId === projectId, "getStats returned correct projectId");
    assert(stats.collectionsCount >= 1, "stats reflects collections count");
    assert(stats.totalRecords >= 1, "stats reflects records count");
    console.log("  ✓ getStats() passed");

    // 12. deleteRecord() with expectedSha
    console.log("\n12. Testing deleteRecord()...");
    const deleteRes = await client.deleteRecord("invoices", "inv_001", updatedSha);
    assert(deleteRes.success === true, "deleteRecord succeeded");

    // Verify 404 on deleted record
    try {
      await client.getRecord("invoices", "inv_001");
      assert.fail("Should have thrown 404 for deleted record");
    } catch (err) {
      assert(err instanceof DatabaseApiError, "Error is DatabaseApiError");
      assert(err.statusCode === 404, "Deleted record returned 404 Not Found");
      console.log("  ✓ deleteRecord() verified with 404 confirmation");
    }

    // 13. Security: Check for secret exposure in client memory/attributes
    console.log("\n13. Testing Secret Isolation in Client Instance...");
    const clientKeys = Object.keys(client);
    const clientDump = JSON.stringify(client);
    assert(!clientDump.includes("GITHUB_STORAGE_PAT"), "Client does not expose GITHUB_STORAGE_PAT");
    assert(!clientDump.includes("SESSION_SECRET"), "Client does not expose SESSION_SECRET");
    console.log("  ✓ No server secrets exposed in client");

    console.log("\n==================================================");
    console.log("🎉 ALL EXTERNAL SDK TEST APPLICATION TESTS PASSED!");
    console.log("==================================================");
  } finally {
    if (serverProcess) {
      serverProcess.kill();
    }
  }
}

runTest().catch((err) => {
  console.error("\n❌ External SDK test suite failed:", err);
  process.exit(1);
});
