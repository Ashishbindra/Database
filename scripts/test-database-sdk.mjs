import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { createServer } from "node:net";

// Import the HTTP-only Client SDK
// Node.js 22+ type stripping supports importing TypeScript files directly
import { EncryptedDatabaseClient, DatabaseApiError } from "../src/sdk/database/EncryptedDatabaseClient.ts";

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

async function runSdkIntegrationTest() {
  console.log("==================================================");
  console.log("ENCRYPTED DATABASE CLIENT SDK INTEGRATION TEST");
  console.log("==================================================");

  let targetBaseUrl = "";
  let serverProcess = null;

  if (candidateProductionUrl && (await checkUrlReachable(candidateProductionUrl))) {
    targetBaseUrl = candidateProductionUrl.startsWith("http")
      ? candidateProductionUrl
      : `https://${candidateProductionUrl}`;
    console.log(`[TARGET] Connecting to Deployed Server: ${targetBaseUrl}`);
  } else {
    const allocatedPort = await getAvailablePort();
    console.log(`[TARGET] Starting standalone test server on port ${allocatedPort}...`);
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
      if (await checkUrlReachable(targetBaseUrl)) {
        ready = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    if (!ready) {
      if (serverProcess) serverProcess.kill("SIGKILL");
      throw new Error(`Failed to boot server at ${targetBaseUrl}`);
    }
    console.log(`✓ Test server ready at ${targetBaseUrl}`);
  }

  try {
    // 1. Authenticate user to obtain session token
    const testUsername = `sdk_user_${Date.now()}`;
    const opaqueUserId = `opaque_sdk_user_${Date.now()}`;
    const regRes = await fetch(`${targetBaseUrl}/api/vault/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: testUsername,
        opaqueUserId,
        saltHex: "aabbccddeeff00112233445566778899",
        authProofHash: "proof_hash_sample_client_sdk",
        wrappedDek: "wrapped_dek_sample_client_sdk",
      }),
    });
    const regData = await regRes.json();
    assert.strictEqual(regRes.status, 200, "Registration must succeed");
    const userSessionToken = regData.sessionToken;
    assert.ok(userSessionToken, "Must receive userSessionToken");

    console.log("1. User authenticated. Initializing SDK...");

    // 2. Test Static helper: createProject
    const projectId = `sdk_proj_${Date.now()}`;
    const projectInfo = await EncryptedDatabaseClient.createProject({
      baseUrl: targetBaseUrl,
      userSessionToken,
      projectId,
    });
    assert.strictEqual(projectInfo.projectId, projectId);
    assert.ok(projectInfo.projectToken, "Should return valid projectToken");
    console.log(`✓ Step 1 & 2: Project created via SDK static helper (ID: ${projectId})`);

    // 3. Test Static helper: listProjects
    const projectsList = await EncryptedDatabaseClient.listProjects({
      baseUrl: targetBaseUrl,
      userSessionToken,
    });
    assert.ok(Array.isArray(projectsList), "Projects must be an array");
    assert.ok(projectsList.some((p) => p.projectId === projectId), "Created project must appear in list");
    console.log(`✓ Step 3: Projects listed successfully (${projectsList.length} total)`);

    // 4. Instantiate EncryptedDatabaseClient for the project
    const db = new EncryptedDatabaseClient({
      baseUrl: targetBaseUrl,
      projectId,
      projectToken: projectInfo.projectToken,
    });

    // 5. Test createCollection
    const collRes = await db.createCollection("invoices");
    assert.strictEqual(collRes.success, true);
    assert.strictEqual(collRes.collection, "invoices");
    console.log("✓ Step 4 & 5: Collection 'invoices' created successfully");

    // 6. Test listCollections
    const collections = await db.listCollections();
    assert.ok(collections.includes("invoices"), "Collections list must include 'invoices'");
    console.log(`✓ Step 6: Collections listed successfully: [${collections.join(", ")}]`);

    // 7. Test createRecord with explicit ID
    const rec1Id = "inv_2026_001";
    const rec1Data = {
      client: "Acme Corp",
      amount: 4500.5,
      status: "paid",
      currency: "USD",
    };
    const createRes = await db.createRecord("invoices", rec1Data, rec1Id);
    assert.strictEqual(createRes.success, true);
    assert.strictEqual(createRes.recordId, rec1Id);
    assert.ok(createRes.sha, "Must receive record SHA");
    const initialSha = createRes.sha;
    console.log(`✓ Step 7: Record created (ID: ${rec1Id}, SHA: ${initialSha.substring(0, 10)}...)`);

    // 8. Test getRecord
    const fetchedRec = await db.getRecord("invoices", rec1Id);
    assert.strictEqual(fetchedRec.recordId, rec1Id);
    assert.strictEqual(fetchedRec.data.client, "Acme Corp");
    assert.strictEqual(fetchedRec.data.amount, 4500.5);
    assert.strictEqual(fetchedRec.sha, initialSha);
    console.log("✓ Step 8: Record retrieved and data payload verified");

    // 9. Test updateRecord with optimistic concurrency (expectedSha)
    const updatedData = {
      ...rec1Data,
      status: "refunded",
      refundReason: "Customer requested cancellation",
    };
    const updateRes = await db.updateRecord("invoices", rec1Id, updatedData, initialSha);
    assert.strictEqual(updateRes.success, true);
    assert.ok(updateRes.sha, "Must receive new updated SHA");
    const updatedSha = updateRes.sha;
    assert.notStrictEqual(updatedSha, initialSha, "Updated SHA must differ from initial SHA");
    console.log(`✓ Step 9: Record updated with expectedSha (New SHA: ${updatedSha.substring(0, 10)}...)`);

    // 10. Test optimistic concurrency rejection on stale SHA
    let conflictCaught = false;
    try {
      await db.updateRecord("invoices", rec1Id, { ...updatedData, status: "conflict_test" }, "stale_sha_12345");
    } catch (err) {
      if (err instanceof DatabaseApiError && err.status === 409) {
        conflictCaught = true;
      }
    }
    assert.strictEqual(conflictCaught, true, "Must catch 409 Conflict with DatabaseApiError");
    console.log("✓ Step 10: Optimistic concurrency conflict correctly threw DatabaseApiError (HTTP 409)");

    // 11. Test createRecord with auto-generated ID
    const autoRec = await db.createRecord("invoices", {
      client: "Beta Global",
      amount: 12000,
      status: "pending",
      currency: "EUR",
    });
    assert.strictEqual(autoRec.success, true);
    assert.ok(autoRec.recordId, "Server must generate random record ID");
    console.log(`✓ Step 11: Auto-generated record ID created (${autoRec.recordId})`);

    // 12. Test listRecords (all records)
    const allRecords = await db.listRecords("invoices");
    assert.ok(allRecords.length >= 2, "Should list all created records");
    console.log(`✓ Step 12: listRecords returned ${allRecords.length} records`);

    // 13. Test listRecords with filter
    const filteredRecords = await db.listRecords("invoices", {
      filterField: "status",
      filterValue: "refunded",
    });
    assert.strictEqual(filteredRecords.length, 1);
    assert.strictEqual(filteredRecords[0].recordId, rec1Id);
    assert.strictEqual(filteredRecords[0].data.status, "refunded");
    console.log("✓ Step 13: listRecords with filter predicate returned matching subset");

    // 14. Test deleteRecord
    const deleteRes = await db.deleteRecord("invoices", rec1Id, updatedSha);
    assert.strictEqual(deleteRes.success, true);
    console.log("✓ Step 14: Record deleted successfully");

    // 15. Verify 404 on deleted record
    let notFoundCaught = false;
    try {
      await db.getRecord("invoices", rec1Id);
    } catch (err) {
      if (err instanceof DatabaseApiError && err.status === 404) {
        notFoundCaught = true;
      }
    }
    assert.strictEqual(notFoundCaught, true, "Must catch 404 Not Found on deleted record");
    console.log("✓ Step 15: Confirmed 404 Not Found on deleted record");

    // Clean up auto generated record
    await db.deleteRecord("invoices", autoRec.recordId);

    console.log("==================================================");
    console.log("ALL ENCRYPTED DATABASE CLIENT SDK TESTS PASSED!");
    console.log("==================================================");
  } finally {
    if (serverProcess) {
      serverProcess.kill("SIGKILL");
    }
  }
}

runSdkIntegrationTest().catch((err) => {
  console.error("SDK Integration test failed:", err);
  process.exit(1);
});
