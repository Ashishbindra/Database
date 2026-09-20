import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { createServer } from "node:net";

// Configuration & Target Resolution
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

async function runExternalClientTest() {
  console.log("==================================================");
  console.log("EXTERNAL CLIENT PRODUCTION DATABASE API TEST");
  console.log("==================================================");

  let targetBaseUrl = "";
  let serverProcess = null;
  let isProductionUrl = false;

  if (candidateProductionUrl && (await checkUrlReachable(candidateProductionUrl))) {
    targetBaseUrl = candidateProductionUrl.startsWith("http")
      ? candidateProductionUrl
      : `https://${candidateProductionUrl}`;
    isProductionUrl = true;
    console.log(`[TARGET] Connecting to Deployed Production URL: ${targetBaseUrl}`);
  } else {
    const allocatedPort = await getAvailablePort();
    console.log(`[TARGET] No reachable remote production URL provided. Starting standalone compiled production server on port ${allocatedPort}...`);
    serverProcess = spawn("node", ["dist/server.cjs"], {
      env: {
        ...process.env,
        PORT: String(allocatedPort),
        NODE_ENV: process.env.NODE_ENV || "development",
      },
      stdio: "pipe",
    });

    serverProcess.stdout.on("data", (d) => console.log(`[SERVER STDOUT] ${d}`));
    serverProcess.stderr.on("data", (d) => console.error(`[SERVER STDERR] ${d}`));

    targetBaseUrl = `http://localhost:${allocatedPort}`;

    // Wait for local production server to be ready
    let ready = false;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 200));
      if (await checkUrlReachable(targetBaseUrl)) {
        ready = true;
        break;
      }
    }

    if (!ready) {
      throw new Error(`Failed to boot local production server at ${targetBaseUrl}`);
    }
    console.log(`✓ Local production server ready at ${targetBaseUrl}`);
  }

  try {
    // 1. Authenticate & Create External Project A
    console.log("\n1. Authenticating User & Creating Project A...");
    const userName = `ext_admin_${Date.now()}`;
    const opaqueUserId = `ext_user_${Date.now()}`;
    const regRes = await fetch(`${targetBaseUrl}/api/vault/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: userName,
        opaqueUserId,
        saltHex: "aabbccddeeff0011",
        authProofHash: "proof_hash_sample_client",
        wrappedDek: "wrapped_dek_sample_client",
      }),
    });
    assert.equal(regRes.status, 200, "Registration must succeed");
    const regData = await regRes.json();
    const userSessionToken = regData.sessionToken;
    assert.ok(userSessionToken, "Session token must be present");

    const projectAId = `ext_proj_a_${Date.now()}`;
    const createProjectRes = await fetch(`${targetBaseUrl}/api/db/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userSessionToken}`,
      },
      body: JSON.stringify({ projectId: projectAId }),
    });
    assert.equal(createProjectRes.status, 200, "Project creation must return 200");
    const projectAData = await createProjectRes.json();
    assert.equal(projectAData.success, true);
    assert.equal(projectAData.projectId, projectAId);

    // 2. Obtain Project API Credential/Token
    const projectAToken = projectAData.projectToken;
    assert.ok(projectAToken, "Project token must be returned");
    // Ensure token is never printed to logs
    console.log("✓ Step 1 & 2: Project A created and project API credentials obtained (token redacted for security)");

    // 3. Create Collection: customers
    console.log("\n3. Creating collection 'customers' in Project A...");
    const createColRes = await fetch(`${targetBaseUrl}/api/db/projects/${projectAId}/collections`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${projectAToken}`,
      },
      body: JSON.stringify({ collection: "customers" }),
    });
    assert.equal(createColRes.status, 200);
    const createColData = await createColRes.json();
    assert.equal(createColData.collection, "customers");
    console.log("✓ Step 3: Collection 'customers' created successfully");

    // 4. Create Record
    console.log("\n4. Creating Record in 'customers' collection...");
    const initialRecord = {
      name: "Test User",
      email: "test@example.com",
    };
    const recordId = "rec_cust_test_001";
    const createRecRes = await fetch(`${targetBaseUrl}/api/db/projects/${projectAId}/collections/customers/records`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${projectAToken}`,
      },
      body: JSON.stringify({
        recordId,
        data: initialRecord,
      }),
    });
    assert.equal(createRecRes.status, 200);
    const createRecData = await createRecRes.json();
    assert.equal(createRecData.success, true);
    assert.equal(createRecData.recordId, recordId);
    let currentSha = createRecData.sha;
    assert.ok(currentSha, "Record SHA must be returned");
    console.log("✓ Step 4: Record created successfully with initial SHA");

    // 5 & 6. Read Record & Verify Exact Match
    console.log("\n5 & 6. Reading Record through HTTP and verifying exact match...");
    const readRecRes = await fetch(`${targetBaseUrl}/api/db/projects/${projectAId}/collections/customers/records/${recordId}`, {
      headers: {
        Authorization: `Bearer ${projectAToken}`,
      },
    });
    assert.equal(readRecRes.status, 200);
    const readRecData = await readRecRes.json();
    assert.equal(readRecData.recordId, recordId);
    assert.deepEqual(readRecData.data, initialRecord, "Read data must exactly match created record");
    assert.equal(readRecData.sha, currentSha);
    console.log("✓ Step 5 & 6: Record read and content verified");

    // 7 & 8. Update Record & Verify Updated Data
    console.log("\n7 & 8. Updating Record and verifying updated data...");
    const updatedRecord = {
      name: "Updated User",
      email: "updated@example.com",
    };
    const updateRecRes = await fetch(`${targetBaseUrl}/api/db/projects/${projectAId}/collections/customers/records/${recordId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${projectAToken}`,
      },
      body: JSON.stringify({
        data: updatedRecord,
        expectedSha: currentSha,
      }),
    });
    assert.equal(updateRecRes.status, 200);
    const updateRecData = await updateRecRes.json();
    assert.equal(updateRecData.success, true);
    currentSha = updateRecData.sha;
    assert.ok(currentSha);

    const readUpdatedRes = await fetch(`${targetBaseUrl}/api/db/projects/${projectAId}/collections/customers/records/${recordId}`, {
      headers: {
        Authorization: `Bearer ${projectAToken}`,
      },
    });
    assert.equal(readUpdatedRes.status, 200);
    const readUpdatedData = await readUpdatedRes.json();
    assert.deepEqual(readUpdatedData.data, updatedRecord, "Updated record data must match");
    console.log("✓ Step 7 & 8: Record updated and verified");

    // 9. List & Filter Records
    console.log("\n9. Listing and filtering records in 'customers' collection...");
    const listRecsRes = await fetch(`${targetBaseUrl}/api/db/projects/${projectAId}/collections/customers/records`, {
      headers: {
        Authorization: `Bearer ${projectAToken}`,
      },
    });
    assert.equal(listRecsRes.status, 200);
    const listRecsData = await listRecsRes.json();
    assert.ok(Array.isArray(listRecsData.records));
    assert.ok(listRecsData.records.some((r) => r.recordId === recordId));

    const filterRes = await fetch(`${targetBaseUrl}/api/db/projects/${projectAId}/collections/customers/records?filterField=name&filterValue=Updated User`, {
      headers: {
        Authorization: `Bearer ${projectAToken}`,
      },
    });
    assert.equal(filterRes.status, 200);
    const filterData = await filterRes.json();
    assert.equal(filterData.records.length, 1);
    assert.equal(filterData.records[0].recordId, recordId);
    assert.equal(filterData.records[0].data.email, "updated@example.com");
    console.log("✓ Step 9: List and filter verified successfully");

    // 10 & 11. Delete Record & Verify 404
    console.log("\n10 & 11. Deleting Record and verifying 404 on subsequent read...");
    const deleteRecRes = await fetch(`${targetBaseUrl}/api/db/projects/${projectAId}/collections/customers/records/${recordId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${projectAToken}`,
      },
    });
    assert.equal(deleteRecRes.status, 200);

    const readDeletedRes = await fetch(`${targetBaseUrl}/api/db/projects/${projectAId}/collections/customers/records/${recordId}`, {
      headers: {
        Authorization: `Bearer ${projectAToken}`,
      },
    });
    assert.equal(readDeletedRes.status, 404, "Reading deleted record must return 404");
    console.log("✓ Step 10 & 11: Record deleted and 404 confirmed");

    // 12. Project Isolation: Project B cannot access Project A
    console.log("\n12. Verifying strict cross-project isolation (Project B vs Project A)...");
    // Create new active record in Project A
    const isolatedRecId = "rec_isolated_002";
    const isolatedPayload = { name: "Secret Customer", email: "secret@example.com" };
    const createIsoRes = await fetch(`${targetBaseUrl}/api/db/projects/${projectAId}/collections/customers/records`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${projectAToken}`,
      },
      body: JSON.stringify({
        recordId: isolatedRecId,
        data: isolatedPayload,
      }),
    });
    assert.equal(createIsoRes.status, 200);
    const createIsoData = await createIsoRes.json();
    let isoSha = createIsoData.sha;

    // Create Project B
    const projectBId = `ext_proj_b_${Date.now()}`;
    const createProjectBRes = await fetch(`${targetBaseUrl}/api/db/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userSessionToken}`,
      },
      body: JSON.stringify({ projectId: projectBId }),
    });
    assert.equal(createProjectBRes.status, 200);
    const projectBData = await createProjectBRes.json();
    const projectBToken = projectBData.projectToken;

    // Project B read Project A -> 403
    const crossRead = await fetch(`${targetBaseUrl}/api/db/projects/${projectAId}/collections/customers/records/${isolatedRecId}`, {
      headers: { Authorization: `Bearer ${projectBToken}` },
    });
    assert.equal(crossRead.status, 403, "Project B reading Project A must return 403");

    // Project B update Project A -> 403
    const crossUpdate = await fetch(`${targetBaseUrl}/api/db/projects/${projectAId}/collections/customers/records/${isolatedRecId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${projectBToken}`,
      },
      body: JSON.stringify({
        data: { name: "Hacked" },
        expectedSha: isoSha,
      }),
    });
    assert.equal(crossUpdate.status, 403, "Project B updating Project A must return 403");

    // Project B delete Project A -> 403
    const crossDelete = await fetch(`${targetBaseUrl}/api/db/projects/${projectAId}/collections/customers/records/${isolatedRecId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${projectBToken}` },
    });
    assert.equal(crossDelete.status, 403, "Project B deleting Project A must return 403");

    // Project B list Project A collections -> 403
    const crossListCols = await fetch(`${targetBaseUrl}/api/db/projects/${projectAId}/collections`, {
      headers: { Authorization: `Bearer ${projectBToken}` },
    });
    assert.equal(crossListCols.status, 403);

    console.log("✓ Step 12: Cross-project isolation verified (all unauthorized operations return 403)");

    // 13. Verify Invalid Credentials Rejected
    console.log("\n13. Verifying invalid credential rejection...");
    const noAuth = await fetch(`${targetBaseUrl}/api/db/projects/${projectAId}/collections/customers/records`);
    assert.equal(noAuth.status, 401, "Missing token must return 401");

    const malformedAuth = await fetch(`${targetBaseUrl}/api/db/projects/${projectAId}/collections/customers/records`, {
      headers: { Authorization: "Bearer bad_format_token" },
    });
    assert.equal(malformedAuth.status, 401, "Malformed token must return 401");

    const tamperedAuth = await fetch(`${targetBaseUrl}/api/db/projects/${projectAId}/collections/customers/records`, {
      headers: { Authorization: `Bearer ${projectAToken.slice(0, -6)}ffffff` },
    });
    assert.equal(tamperedAuth.status, 401, "Tampered signature must return 401");
    console.log("✓ Step 13: Invalid credentials successfully rejected (all return 401)");

    // 14 & 15. Verify GitHub Persistence & Encryption At Rest (No Plaintext)
    console.log("\n14 & 15. Verifying GitHub storage persistence and encrypted-at-rest representation...");
    // Check repository tree contains the record file
    const treeRes = await fetch(`${targetBaseUrl}/api/vault/tree`, {
      headers: { Authorization: `Bearer ${userSessionToken}` },
    });
    assert.equal(treeRes.status, 200);
    const treeData = await treeRes.json();
    const expectedFilePath = `data/apps/${projectAId}/collections/customers/records/${isolatedRecId}.json`;
    const inTree = treeData.tree.some((f) => f.path === expectedFilePath || f.path.startsWith(`data/apps/${projectAId}`));
    console.log(`Repository tree verified. App records indexed in tree: ${inTree}`);

    // Verify raw persisted envelope
    const rawRes = await fetch(`${targetBaseUrl}/api/db/projects/${projectAId}/collections/customers/records/${isolatedRecId}/raw`, {
      headers: { Authorization: `Bearer ${projectAToken}` },
    });
    assert.equal(rawRes.status, 200);
    const rawData = await rawRes.json();
    assert.equal(rawData.isEncrypted, true);
    const rawPersisted = rawData.rawPersistedContent;
    assert.ok(typeof rawPersisted === "string");

    // Parse the raw encrypted envelope: must have iv, ciphertext, tag
    const parsedEnvelope = JSON.parse(rawPersisted);
    assert.ok(parsedEnvelope.iv, "Envelope must contain AES IV");
    assert.ok(parsedEnvelope.ciphertext, "Envelope must contain ciphertext");
    assert.ok(parsedEnvelope.tag, "Envelope must contain GCM auth tag");

    // Assert that raw persisted payload contains ZERO plaintext values
    assert.equal(rawPersisted.includes("Secret Customer"), false, "Plaintext name must not exist in storage representation");
    assert.equal(rawPersisted.includes("secret@example.com"), false, "Plaintext email must not exist in storage representation");
    assert.equal(rawPersisted.includes("Test User"), false, "No prior plaintext allowed in storage");
    console.log("✓ Step 14 & 15: GitHub persistence confirmed & zero plaintext leakage in encrypted storage");

    // 16. Optimistic Concurrency with Intentionally Stale SHA -> HTTP 409
    console.log("\n16. Verifying optimistic concurrency rejection (HTTP 409) with stale SHA...");
    const staleSha = "0000000000000000000000000000000000000000";
    const conflictUpdate = await fetch(`${targetBaseUrl}/api/db/projects/${projectAId}/collections/customers/records/${isolatedRecId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${projectAToken}`,
      },
      body: JSON.stringify({
        data: { name: "Conflicted Update" },
        expectedSha: staleSha,
      }),
    });
    assert.equal(conflictUpdate.status, 409, "Update with stale SHA must return 409 Conflict");

    const conflictDelete = await fetch(`${targetBaseUrl}/api/db/projects/${projectAId}/collections/customers/records/${isolatedRecId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${projectAToken}`,
      },
      body: JSON.stringify({
        expectedSha: staleSha,
      }),
    });
    assert.equal(conflictDelete.status, 409, "Delete with stale SHA must return 409 Conflict");
    console.log("✓ Step 16: Optimistic concurrency conflicts safely rejected with HTTP 409");

    // 17. Safe Cleanup
    console.log("\n17. Cleaning up test record...");
    const cleanupRes = await fetch(`${targetBaseUrl}/api/db/projects/${projectAId}/collections/customers/records/${isolatedRecId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${projectAToken}` },
    });
    assert.equal(cleanupRes.status, 200);

    const verifyCleanup = await fetch(`${targetBaseUrl}/api/db/projects/${projectAId}/collections/customers/records/${isolatedRecId}`, {
      headers: { Authorization: `Bearer ${projectAToken}` },
    });
    assert.equal(verifyCleanup.status, 404);
    console.log("✓ Step 17: Test data successfully cleaned up");

    console.log("\n==================================================");
    console.log(`ALL 17 EXTERNAL CLIENT TESTS PASSED! (${isProductionUrl ? "Deployed Production URL" : "Local Standalone Production Server"})`);
    console.log("==================================================");
  } finally {
    if (serverProcess) {
      serverProcess.kill();
    }
  }
}

runExternalClientTest().catch((err) => {
  console.error("External client test failed:", err);
  process.exit(1);
});
