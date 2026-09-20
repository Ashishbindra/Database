import { strict as assert } from "node:assert";
import { app } from "../dist/server.cjs";
import { createServer } from "node:http";

async function runPhase3Tests() {
  console.log("==================================================");
  console.log("🚀 PHASE 3: REAL DEVELOPER USABILITY & PRODUCTION TEST SUITE");
  console.log("==================================================");

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 3000;
  const baseUrl = `http://localhost:${port}`;

  try {
    // 1. Health check & rate limit headers
    console.log("\n--- TEST 1: Service Health & Rate Limiter Headers ---");
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200, "Health check endpoint returns HTTP 200");
    const healthJson = await healthRes.json();
    assert.ok(healthJson.status === "healthy" || healthJson.status === "ok", "Health status is reported");
    
    const limitHdr = healthRes.headers.get("x-ratelimit-limit");
    const remHdr = healthRes.headers.get("x-ratelimit-remaining");
    const resetHdr = healthRes.headers.get("x-ratelimit-reset");
    assert.ok(limitHdr !== null, "X-RateLimit-Limit header is present");
    assert.ok(remHdr !== null, "X-RateLimit-Remaining header is present");
    assert.ok(resetHdr !== null, "X-RateLimit-Reset header is present");
    console.log("✓ Test 1 Passed: Rate limiter and health operational");

    // 2. Malformed JSON parsing defense
    console.log("\n--- TEST 2: Malformed JSON Defense (HTTP 400) ---");
    const badJsonRes = await fetch(`${baseUrl}/api/db/projects`, {
      method: "POST",
      headers: {
        "Authorization": "Bearer demo-session-token",
        "Content-Type": "application/json",
      },
      body: "{ malformed json: true,",
    });
    assert.equal(badJsonRes.status, 400, "Malformed JSON yields HTTP 400 Bad Request");
    const badJsonBody = await badJsonRes.json();
    assert.equal(badJsonBody.error, "Bad Request", "Standard JSON error response returned");
    console.log("✓ Test 2 Passed: Malformed JSON handled cleanly");

    // 3. User Session Token Authentication
    console.log("\n--- TEST 3: User Authentication ---");
    const userName = `p3_dev_${Date.now()}`;
    const opaqueUserId = `opaque_p3_${Date.now()}`;
    const regRes = await fetch(`${baseUrl}/api/vault/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: userName,
        opaqueUserId,
        saltHex: "1122334455667788",
        authProofHash: "proofhash_phase3",
        wrappedDek: "wrappeddek_phase3",
      }),
    });
    assert.equal(regRes.status, 200);
    const regData = await regRes.json();
    const userSessionToken = regData.sessionToken;
    assert.ok(userSessionToken);
    console.log("✓ Test 3 Passed: User session acquired");

    // 4. Project Creation & Token Verification
    console.log("\n--- TEST 4: Project Management & Token Lifecycle ---");
    const testProjectId = `proj_p3_${Date.now()}`;
    const createProjectRes = await fetch(`${baseUrl}/api/db/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${userSessionToken}`,
      },
      body: JSON.stringify({ projectId: testProjectId }),
    });
    assert.equal(createProjectRes.status, 200);
    const projectData = await createProjectRes.json();
    assert.equal(projectData.projectId, testProjectId);
    const initialToken = projectData.projectToken;
    assert.ok(initialToken);
    console.log("✓ Test 4 Passed: Project and token created");

    // 5. Create Collection
    console.log("\n--- TEST 5: Encrypted Collection Management ---");
    const testCollection = "users";
    const createColRes = await fetch(`${baseUrl}/api/db/projects/${testProjectId}/collections`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${initialToken}`,
      },
      body: JSON.stringify({ collection: testCollection }),
    });
    assert.equal(createColRes.status, 200);
    const colData = await createColRes.json();
    assert.equal(colData.collection, testCollection);

    const listColsRes = await fetch(`${baseUrl}/api/db/projects/${testProjectId}/collections`, {
      headers: { "Authorization": `Bearer ${initialToken}` },
    });
    assert.equal(listColsRes.status, 200);
    const listColsData = await listColsRes.json();
    assert.ok(listColsData.collections.includes(testCollection));
    console.log("✓ Test 5 Passed: Collection created and listed");

    // 6. Record CRUD with AES-256-GCM & Concurrency
    console.log("\n--- TEST 6: Record CRUD & Cryptographic Envelopes ---");
    const testRecordId = "usr_001";
    const initialData = {
      name: "Alice Developer",
      tier: "pro",
      active: true,
      score: 95,
    };

    const createRecRes = await fetch(`${baseUrl}/api/db/projects/${testProjectId}/collections/${testCollection}/records`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${initialToken}`,
      },
      body: JSON.stringify({ recordId: testRecordId, data: initialData }),
    });
    assert.equal(createRecRes.status, 200);
    const createRecData = await createRecRes.json();
    assert.equal(createRecData.recordId, testRecordId);
    const initialSha = createRecData.sha;
    assert.ok(initialSha);

    // Read decrypted record
    const getRecRes = await fetch(`${baseUrl}/api/db/projects/${testProjectId}/collections/${testCollection}/records/${testRecordId}`, {
      headers: { "Authorization": `Bearer ${initialToken}` },
    });
    assert.equal(getRecRes.status, 200);
    const getRecData = await getRecRes.json();
    assert.equal(getRecData.data.name, "Alice Developer");
    assert.equal(getRecData.sha, initialSha);

    // Inspect raw AES-256-GCM ciphertext
    const rawRes = await fetch(`${baseUrl}/api/db/projects/${testProjectId}/collections/${testCollection}/records/${testRecordId}/raw`, {
      headers: { "Authorization": `Bearer ${initialToken}` },
    });
    assert.equal(rawRes.status, 200);
    const rawData = await rawRes.json();
    assert.ok(rawData.rawPersistedContent);
    const rawEnvelope = JSON.parse(rawData.rawPersistedContent);
    assert.equal(rawEnvelope.iv.length, 24);
    assert.equal(rawEnvelope.tag.length, 32);
    assert.ok(!rawData.rawPersistedContent.includes("Alice Developer"));
    console.log("✓ Test 6 Passed: Record encrypted & decrypted via AES-256-GCM");

    // 7. Optimistic Concurrency Update
    console.log("\n--- TEST 7: Optimistic Concurrency Validation ---");
    const updatedData = { ...initialData, score: 99 };
    const updateRecRes = await fetch(`${baseUrl}/api/db/projects/${testProjectId}/collections/${testCollection}/records/${testRecordId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${initialToken}`,
      },
      body: JSON.stringify({ data: updatedData, expectedSha: initialSha }),
    });
    assert.equal(updateRecRes.status, 200);
    const updateRecData = await updateRecRes.json();
    const updatedSha = updateRecData.sha;
    assert.notEqual(updatedSha, initialSha);

    // 409 Conflict rejection with stale SHA
    const conflictRes = await fetch(`${baseUrl}/api/db/projects/${testProjectId}/collections/${testCollection}/records/${testRecordId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${initialToken}`,
      },
      body: JSON.stringify({ data: { ...initialData, score: 100 }, expectedSha: "stale_sha_val" }),
    });
    assert.equal(conflictRes.status, 409, "Stale expectedSha triggers HTTP 409 Conflict");
    console.log("✓ Test 7 Passed: Optimistic concurrency with 409 conflict handling");

    // 8. Field Filtering
    console.log("\n--- TEST 8: Server-Side Field Filtering ---");
    await fetch(`${baseUrl}/api/db/projects/${testProjectId}/collections/${testCollection}/records`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${initialToken}`,
      },
      body: JSON.stringify({ recordId: "usr_002", data: { name: "Bob Developer", tier: "free", active: false } }),
    });

    const filterRes = await fetch(`${baseUrl}/api/db/projects/${testProjectId}/collections/${testCollection}/records?filterField=tier&filterValue=pro`, {
      headers: { "Authorization": `Bearer ${initialToken}` },
    });
    assert.equal(filterRes.status, 200);
    const filterData = await filterRes.json();
    assert.equal(filterData.records.length, 1);
    assert.equal(filterData.records[0].data.name, "Alice Developer");
    console.log("✓ Test 8 Passed: Field filtering verified");

    // 9. Telemetry & Project Stats
    console.log("\n--- TEST 9: Telemetry & Statistics Endpoints ---");
    const usageRes = await fetch(`${baseUrl}/api/db/usage`, {
      headers: { "Authorization": `Bearer ${userSessionToken}` },
    });
    assert.equal(usageRes.status, 200);
    const usageData = await usageRes.json();
    assert.ok(usageData.totalProjects >= 1);
    assert.equal(usageData.security.encryption, "AES-256-GCM");

    const statsRes = await fetch(`${baseUrl}/api/db/projects/${testProjectId}/stats`, {
      headers: { "Authorization": `Bearer ${initialToken}` },
    });
    assert.equal(statsRes.status, 200);
    const statsData = await statsRes.json();
    assert.equal(statsData.projectId, testProjectId);
    assert.equal(statsData.totalRecords, 2);
    console.log("✓ Test 9 Passed: Usage and statistics verified");

    // 10. Token Rotation & Revocation
    console.log("\n--- TEST 10: Token Rotation & Security Invalidation ---");
    const rotateRes = await fetch(`${baseUrl}/api/db/projects/${testProjectId}/token/rotate`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${userSessionToken}` },
    });
    assert.equal(rotateRes.status, 200);
    const rotateData = await rotateRes.json();
    const newToken = rotateData.projectToken;
    assert.notEqual(newToken, initialToken);

    // Old token should now fail with 403
    const oldTokenCheck = await fetch(`${baseUrl}/api/db/projects/${testProjectId}/collections`, {
      headers: { "Authorization": `Bearer ${initialToken}` },
    });
    assert.equal(oldTokenCheck.status, 403, "Old rotated token rejected with HTTP 403");

    // New token works
    const newTokenCheck = await fetch(`${baseUrl}/api/db/projects/${testProjectId}/collections`, {
      headers: { "Authorization": `Bearer ${newToken}` },
    });
    assert.equal(newTokenCheck.status, 200, "New rotated token functions normally");
    console.log("✓ Test 10 Passed: Token rotation and invalidation verified");

    // 11. Cleanup
    console.log("\n--- TEST 11: Teardown & Deletion ---");
    const delColRes = await fetch(`${baseUrl}/api/db/projects/${testProjectId}/collections/${testCollection}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${newToken}` },
    });
    assert.equal(delColRes.status, 200);

    const delProjRes = await fetch(`${baseUrl}/api/db/projects/${testProjectId}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${userSessionToken}` },
    });
    assert.equal(delProjRes.status, 200);
    console.log("✓ Test 11 Passed: Teardown complete");

    console.log("\n==================================================");
    console.log("🎉 ALL 11 PHASE 3 INTEGRATION TESTS PASSED!");
    console.log("==================================================");
  } finally {
    server.close();
  }
}

runPhase3Tests().catch((err) => {
  console.error("❌ Phase 3 test failed:", err);
  process.exit(1);
});
