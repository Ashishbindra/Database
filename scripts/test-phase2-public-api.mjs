import { strict as assert } from "node:assert";
import { app } from "../dist/server.cjs";
import { createServer } from "node:http";

async function runPhase2Tests() {
  console.log("==================================================");
  console.log("PHASE 2 PUBLIC DEVELOPER & API EXPERIENCE TESTS");
  console.log("==================================================");

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 3000;
  const baseUrl = `http://localhost:${port}`;

  try {
    // 1. Register User to get user session token
    console.log("Step 1: Authenticate User Session...");
    const userName = `p2_dev_${Date.now()}`;
    const opaqueUserId = `opaque_p2_${Date.now()}`;
    const regRes = await fetch(`${baseUrl}/api/vault/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: userName,
        opaqueUserId,
        saltHex: "aabbccddeeff1122",
        authProofHash: "proofhash_phase2",
        wrappedDek: "wrappeddek_phase2",
      }),
    });
    assert.equal(regRes.status, 200);
    const regData = await regRes.json();
    const userSessionToken = regData.sessionToken;
    assert.ok(userSessionToken);
    console.log("✓ Step 1 Passed: User session acquired");

    // 2. Create Project
    console.log("Step 2: Create Project...");
    const projectId = `proj_p2_${Date.now()}`;
    const createProjectRes = await fetch(`${baseUrl}/api/db/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${userSessionToken}`,
      },
      body: JSON.stringify({ projectId }),
    });
    assert.equal(createProjectRes.status, 200);
    const projectData = await createProjectRes.json();
    assert.equal(projectData.projectId, projectId);
    const projectToken = projectData.projectToken;
    assert.ok(projectToken);
    console.log("✓ Step 2 Passed: Project created with HMAC token");

    // 3. Test Usage Telemetry API
    console.log("Step 3: Test GET /api/db/usage telemetry...");
    const usageRes = await fetch(`${baseUrl}/api/db/usage`, {
      headers: { "Authorization": `Bearer ${userSessionToken}` },
    });
    assert.equal(usageRes.status, 200);
    const usageData = await usageRes.json();
    assert.equal(usageData.success, true);
    assert.ok(usageData.totalProjects >= 1);
    assert.ok(usageData.storage);
    assert.ok(usageData.security);
    console.log("✓ Step 3 Passed: Developer usage telemetry verified");

    // 4. Create collection & records
    console.log("Step 4: Create collection and records...");
    const createColRes = await fetch(`${baseUrl}/api/db/projects/${projectId}/collections`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${projectToken}`,
      },
      body: JSON.stringify({ collection: "customers" }),
    });
    assert.equal(createColRes.status, 200);

    const recordRes = await fetch(`${baseUrl}/api/db/projects/${projectId}/collections/customers/records`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${projectToken}`,
      },
      body: JSON.stringify({
        recordId: "cust_p2_01",
        data: { name: "Phase 2 User", status: "active", plan: "developer" },
      }),
    });
    assert.equal(recordRes.status, 200);
    const recordData = await recordRes.json();
    assert.equal(recordData.success, true);
    assert.ok(recordData.sha);
    console.log("✓ Step 4 Passed: Encrypted collection & record creation verified");

    // 5. Test Project Stats API
    console.log("Step 5: Test GET /api/db/projects/:projectId/stats...");
    const statsRes = await fetch(`${baseUrl}/api/db/projects/${projectId}/stats`, {
      headers: { "Authorization": `Bearer ${projectToken}` },
    });
    assert.equal(statsRes.status, 200);
    const statsData = await statsRes.json();
    assert.equal(statsData.success, true);
    assert.equal(statsData.projectId, projectId);
    assert.ok(statsData.collectionsCount >= 1);
    assert.ok(statsData.totalRecords >= 1);
    console.log("✓ Step 5 Passed: Project statistics & breakdown verified");

    // 6. Test Optimistic Concurrency Update
    console.log("Step 6: Test Optimistic Concurrency with expectedSha...");
    const updateRes = await fetch(`${baseUrl}/api/db/projects/${projectId}/collections/customers/records/cust_p2_01`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${projectToken}`,
      },
      body: JSON.stringify({
        expectedSha: recordData.sha,
        data: { name: "Phase 2 User", status: "active", plan: "enterprise" },
      }),
    });
    assert.equal(updateRes.status, 200);
    const updatedData = await updateRes.json();
    assert.notEqual(updatedData.sha, recordData.sha);

    // Mismatched SHA should 409
    const conflictRes = await fetch(`${baseUrl}/api/db/projects/${projectId}/collections/customers/records/cust_p2_01`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${projectToken}`,
      },
      body: JSON.stringify({
        expectedSha: "stale_or_invalid_sha_12345",
        data: { name: "Should Conflict" },
      }),
    });
    assert.equal(conflictRes.status, 409, "Must return HTTP 409 on SHA mismatch");
    console.log("✓ Step 6 Passed: Optimistic concurrency locking & conflict prevention verified");

    // 7. Verify Rate Limit Headers on responses
    console.log("Step 7: Verify Rate Limit Headers...");
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.ok(healthRes.headers.get("x-ratelimit-limit"), "Must include X-RateLimit-Limit");
    assert.ok(healthRes.headers.get("x-ratelimit-remaining"), "Must include X-RateLimit-Remaining");
    console.log("✓ Step 7 Passed: Standard rate limit headers verified");

    console.log("==================================================");
    console.log("ALL PHASE 2 PUBLIC API TESTS PASSED SUCCESSFULLY");
    console.log("==================================================");
  } finally {
    server.close();
  }
}

runPhase2Tests().catch((err) => {
  console.error("Phase 2 Test Failure:", err);
  process.exit(1);
});
