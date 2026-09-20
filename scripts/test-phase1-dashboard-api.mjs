import { strict as assert } from "node:assert";
import { app } from "../dist/server.cjs";
import { createServer } from "node:http";

async function runPhase1Tests() {
  console.log("==================================================");
  console.log("PHASE 1 DEVELOPER DATABASE DASHBOARD API TESTS");
  console.log("==================================================");

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 3000;
  const baseUrl = `http://localhost:${port}`;

  try {
    // 1. Register User to get user session token
    console.log("Step 1: Authenticate User Session...");
    const userName = `devadmin_${Date.now()}`;
    const opaqueUserId = `opaque_dev_${Date.now()}`;
    const regRes = await fetch(`${baseUrl}/api/vault/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: userName,
        opaqueUserId,
        saltHex: "aabbccddeeff",
        authProofHash: "proofhash_phase1",
        wrappedDek: "wrappeddek_phase1",
      }),
    });
    assert.equal(regRes.status, 200);
    const regData = await regRes.json();
    const userSessionToken = regData.sessionToken;
    assert.ok(userSessionToken);
    console.log("✓ Step 1 Passed: User session acquired");

    // 2. Create Project
    console.log("Step 2: Create Project...");
    const projectId = `proj_phase1_${Date.now()}`;
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
    let projectToken = projectData.projectToken;
    assert.ok(projectToken);
    console.log("✓ Step 2 Passed: Project created with token");

    // 3. Update Project Status (disable and re-enable)
    console.log("Step 3: Update Project Status...");
    const disableRes = await fetch(`${baseUrl}/api/db/projects/${projectId}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${userSessionToken}`,
      },
      body: JSON.stringify({ status: "disabled" }),
    });
    assert.equal(disableRes.status, 200);
    const disableData = await disableRes.json();
    assert.equal(disableData.status, "disabled");

    // Verify token rejected when project is disabled
    const colWhenDisabledRes = await fetch(`${baseUrl}/api/db/projects/${projectId}/collections`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${projectToken}`,
      },
      body: JSON.stringify({ collection: "test_col" }),
    });
    assert.equal(colWhenDisabledRes.status, 403, "Disabled project must reject API queries");

    // Re-enable project
    const enableRes = await fetch(`${baseUrl}/api/db/projects/${projectId}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${userSessionToken}`,
      },
      body: JSON.stringify({ status: "active" }),
    });
    assert.equal(enableRes.status, 200);
    console.log("✓ Step 3 Passed: Project status update & authorization enforcement verified");

    // 4. Rotate Token
    console.log("Step 4: Rotate Project API Token...");
    const rotateRes = await fetch(`${baseUrl}/api/db/projects/${projectId}/token/rotate`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${userSessionToken}` },
    });
    assert.equal(rotateRes.status, 200);
    const rotateData = await rotateRes.json();
    const oldToken = projectToken;
    projectToken = rotateData.projectToken;
    assert.notEqual(projectToken, oldToken, "New token must differ from old token");

    // Verify old token is rejected
    const oldTokenTest = await fetch(`${baseUrl}/api/db/projects/${projectId}/collections`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${oldToken}` },
    });
    assert.equal(oldTokenTest.status, 403, "Old token must be rejected after rotation");
    console.log("✓ Step 4 Passed: Token rotation & invalidation of old token verified");

    // 5. Create Collection and Record
    console.log("Step 5: Create Collection & Records...");
    const createColRes = await fetch(`${baseUrl}/api/db/projects/${projectId}/collections`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${projectToken}`,
      },
      body: JSON.stringify({ collection: "inventory" }),
    });
    assert.equal(createColRes.status, 200);

    const recordPayload = { item: "Widget A", qty: 100, price: 49.99 };
    const createRecRes = await fetch(`${baseUrl}/api/db/projects/${projectId}/collections/inventory/records`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${projectToken}`,
      },
      body: JSON.stringify({ recordId: "item_001", data: recordPayload }),
    });
    assert.equal(createRecRes.status, 200);
    const createRecData = await createRecRes.json();
    assert.equal(createRecData.recordId, "item_001");
    const itemSha = createRecData.sha;
    assert.ok(itemSha);
    console.log("✓ Step 5 Passed: Collection and Record created");

    // 6. Inspect Raw Encrypted Envelope
    console.log("Step 6: Inspect Raw Encrypted Envelope on GitHub...");
    const rawRes = await fetch(`${baseUrl}/api/db/projects/${projectId}/collections/inventory/records/item_001/raw`, {
      headers: { "Authorization": `Bearer ${projectToken}` },
    });
    assert.equal(rawRes.status, 200);
    const rawData = await rawRes.json();
    assert.equal(rawData.recordId, "item_001");
    assert.equal(rawData.isEncrypted, true);
    assert.ok(rawData.rawPersistedContent.includes('"ciphertext"'), "Raw envelope must contain ciphertext");
    assert.ok(rawData.rawPersistedContent.includes('"iv"'), "Raw envelope must contain iv");
    assert.ok(rawData.rawPersistedContent.includes('"tag"'), "Raw envelope must contain tag");
    console.log("✓ Step 6 Passed: Raw AES-256-GCM envelope inspected");

    // 7. Delete Record with Optimistic Concurrency SHA
    console.log("Step 7: Delete Record with SHA verification...");
    const delRecRes = await fetch(`${baseUrl}/api/db/projects/${projectId}/collections/inventory/records/item_001?expectedSha=${itemSha}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${projectToken}` },
    });
    assert.equal(delRecRes.status, 200);
    console.log("✓ Step 7 Passed: Record deleted with SHA verification");

    // 8. Delete Collection
    console.log("Step 8: Delete Collection...");
    const delColRes = await fetch(`${baseUrl}/api/db/projects/${projectId}/collections/inventory`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${projectToken}` },
    });
    assert.equal(delColRes.status, 200);
    console.log("✓ Step 8 Passed: Collection deleted");

    // 9. Delete Project
    console.log("Step 9: Delete Project...");
    const delProjRes = await fetch(`${baseUrl}/api/db/projects/${projectId}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${userSessionToken}` },
    });
    assert.equal(delProjRes.status, 200);
    console.log("✓ Step 9 Passed: Project deleted safely");

    console.log("\n==================================================");
    console.log("ALL PHASE 1 DASHBOARD API TESTS PASSED SUCCESSFULLY!");
    console.log("==================================================");
  } finally {
    server.close();
  }
}

runPhase1Tests().catch((err) => {
  console.error("Test Failed:", err);
  process.exit(1);
});
