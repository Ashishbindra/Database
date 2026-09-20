import { strict as assert } from "node:assert";
import { app } from "../dist/server.cjs";
import { createServer } from "node:http";

async function runDatabaseTests() {
  console.log("==================================================");
  console.log("DATABASE SERVICE API INTEGRATION TEST SUITE");
  console.log("==================================================");

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 3000;
  const baseUrl = `http://localhost:${port}`;

  try {
    // 1. User Registration & Setup to manage projects
    console.log("Step 1: Register User & Obtain User Session Token...");
    const userName = `dbadmin_${Date.now()}`;
    const opaqueUserId = `opaque_admin_${Date.now()}`;
    const regRes = await fetch(`${baseUrl}/api/vault/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: userName,
        opaqueUserId,
        saltHex: "112233445566",
        authProofHash: "proofhash123",
        wrappedDek: "wrappeddek123",
      }),
    });
    assert.equal(regRes.status, 200);
    const regData = await regRes.json();
    const userSessionToken = regData.sessionToken;
    assert.ok(userSessionToken);
    console.log("✓ Step 1 Passed: User session acquired");

    // 2. Project A Creation
    console.log("Step 2: Create Project A & Verify Project Token Generation...");
    const projectAId = `project_alpha_${Date.now()}`;
    const createProjectRes = await fetch(`${baseUrl}/api/db/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${userSessionToken}`,
      },
      body: JSON.stringify({ projectId: projectAId }),
    });
    assert.equal(createProjectRes.status, 200);
    const projectAData = await createProjectRes.json();
    assert.equal(projectAData.success, true);
    assert.equal(projectAData.projectId, projectAId);
    const projectAToken = projectAData.projectToken;
    assert.ok(projectAToken, "Project token must be returned");

    // List projects for user
    const listProjectsRes = await fetch(`${baseUrl}/api/db/projects`, {
      headers: { "Authorization": `Bearer ${userSessionToken}` },
    });
    assert.equal(listProjectsRes.status, 200);
    const listProjectsData = await listProjectsRes.json();
    assert.ok(listProjectsData.projects.some((p) => p.projectId === projectAId));
    console.log("✓ Step 2 Passed: Project A created and listed");

    // 3. Project A: Collection Creation and Listing
    console.log("Step 3: Create Collection & List Collections in Project A...");
    const collectionName = "customers";
    const createColRes = await fetch(`${baseUrl}/api/db/projects/${projectAId}/collections`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${projectAToken}`,
      },
      body: JSON.stringify({ collection: collectionName }),
    });
    assert.equal(createColRes.status, 200);
    const createColData = await createColRes.json();
    assert.equal(createColData.collection, collectionName);

    const listColsRes = await fetch(`${baseUrl}/api/db/projects/${projectAId}/collections`, {
      headers: { "Authorization": `Bearer ${projectAToken}` },
    });
    assert.equal(listColsRes.status, 200);
    const listColsData = await listColsRes.json();
    assert.ok(listColsData.collections.includes(collectionName));
    console.log("✓ Step 3 Passed: Collection created and listed");

    // 4. Project A: Record Insertion
    console.log("Step 4: Insert Record into Collection in Project A...");
    const record1Id = "cust_001";
    const record1Payload = { name: "Alice Smith", email: "alice@example.com", tier: "enterprise", balance: 5000 };
    const insertRes = await fetch(`${baseUrl}/api/db/projects/${projectAId}/collections/${collectionName}/records`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${projectAToken}`,
      },
      body: JSON.stringify({
        recordId: record1Id,
        data: record1Payload,
      }),
    });
    assert.equal(insertRes.status, 200);
    const insertData = await insertRes.json();
    assert.equal(insertData.success, true);
    assert.equal(insertData.recordId, record1Id);
    let record1Sha = insertData.sha;
    assert.ok(record1Sha);
    console.log("✓ Step 4 Passed: Record inserted");

    // 5. Project A: Record Retrieval & Decryption
    console.log("Step 5: Get Record & Verify Transparent Decryption...");
    const getRecordRes = await fetch(`${baseUrl}/api/db/projects/${projectAId}/collections/${collectionName}/records/${record1Id}`, {
      headers: { "Authorization": `Bearer ${projectAToken}` },
    });
    assert.equal(getRecordRes.status, 200);
    const getRecordData = await getRecordRes.json();
    assert.equal(getRecordData.recordId, record1Id);
    assert.deepEqual(getRecordData.data, record1Payload);
    assert.equal(getRecordData.sha, record1Sha);
    console.log("✓ Step 5 Passed: Record retrieved and decrypted");

    // 6. Project A: Record Update with SHA Optimistic Concurrency
    console.log("Step 6: Update Record with Optimistic Concurrency...");
    const updatedPayload = { name: "Alice Smith", email: "alice.smith@example.com", tier: "enterprise", balance: 7500 };
    const updateRes = await fetch(`${baseUrl}/api/db/projects/${projectAId}/collections/${collectionName}/records/${record1Id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${projectAToken}`,
      },
      body: JSON.stringify({
        data: updatedPayload,
        expectedSha: record1Sha,
      }),
    });
    assert.equal(updateRes.status, 200);
    const updateData = await updateRes.json();
    assert.equal(updateData.success, true);
    const updatedSha = updateData.sha;
    assert.ok(updatedSha);

    // Verify updated content on retrieval
    const getUpdatedRes = await fetch(`${baseUrl}/api/db/projects/${projectAId}/collections/${collectionName}/records/${record1Id}`, {
      headers: { "Authorization": `Bearer ${projectAToken}` },
    });
    assert.equal(getUpdatedRes.status, 200);
    const getUpdatedData = await getUpdatedRes.json();
    assert.deepEqual(getUpdatedData.data, updatedPayload);
    console.log("✓ Step 6 Passed: Record updated and verified");

    // 7. Project A: List Records & Filter Query
    console.log("Step 7: List & Query Records in Collection...");
    // Insert a second record
    const record2Id = "cust_002";
    const record2Payload = { name: "Bob Jones", email: "bob@example.com", tier: "standard", balance: 1200 };
    await fetch(`${baseUrl}/api/db/projects/${projectAId}/collections/${collectionName}/records`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${projectAToken}`,
      },
      body: JSON.stringify({
        recordId: record2Id,
        data: record2Payload,
      }),
    });

    const listRecordsRes = await fetch(`${baseUrl}/api/db/projects/${projectAId}/collections/${collectionName}/records`, {
      headers: { "Authorization": `Bearer ${projectAToken}` },
    });
    assert.equal(listRecordsRes.status, 200);
    const listRecordsData = await listRecordsRes.json();
    assert.equal(listRecordsData.records.length, 2);

    // Filter query: tier=enterprise
    const queryRes = await fetch(`${baseUrl}/api/db/projects/${projectAId}/collections/${collectionName}/records?filterField=tier&filterValue=enterprise`, {
      headers: { "Authorization": `Bearer ${projectAToken}` },
    });
    assert.equal(queryRes.status, 200);
    const queryData = await queryRes.json();
    assert.equal(queryData.records.length, 1);
    assert.equal(queryData.records[0].recordId, record1Id);
    console.log("✓ Step 7 Passed: List and query filtered records");

    // 8. Project B Creation & Cross-Project Isolation Verification
    console.log("Step 8: Project B Creation & Strict Isolation Enforcements...");
    const projectBId = `project_beta_${Date.now()}`;
    const createProjectBRes = await fetch(`${baseUrl}/api/db/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${userSessionToken}`,
      },
      body: JSON.stringify({ projectId: projectBId }),
    });
    assert.equal(createProjectBRes.status, 200);
    const projectBData = await createProjectBRes.json();
    const projectBToken = projectBData.projectToken;

    // Project B tries to READ Project A's records -> 403 Forbidden
    const crossReadRes = await fetch(`${baseUrl}/api/db/projects/${projectAId}/collections/${collectionName}/records/${record1Id}`, {
      headers: { "Authorization": `Bearer ${projectBToken}` },
    });
    assert.equal(crossReadRes.status, 403);
    const crossReadData = await crossReadRes.json();
    assert.equal(crossReadData.error, "Forbidden");

    // Project B tries to UPDATE Project A's records -> 403 Forbidden
    const crossUpdateRes = await fetch(`${baseUrl}/api/db/projects/${projectAId}/collections/${collectionName}/records/${record1Id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${projectBToken}`,
      },
      body: JSON.stringify({
        data: { name: "Malicious Overwrite" },
        expectedSha: updatedSha,
      }),
    });
    assert.equal(crossUpdateRes.status, 403);

    // Project B tries to DELETE Project A's records -> 403 Forbidden
    const crossDeleteRes = await fetch(`${baseUrl}/api/db/projects/${projectAId}/collections/${collectionName}/records/${record1Id}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${projectBToken}` },
    });
    assert.equal(crossDeleteRes.status, 403);

    // Project B tries to LIST Project A's collections / records -> 403 Forbidden
    const crossListColsRes = await fetch(`${baseUrl}/api/db/projects/${projectAId}/collections`, {
      headers: { "Authorization": `Bearer ${projectBToken}` },
    });
    assert.equal(crossListColsRes.status, 403);

    const crossListRecsRes = await fetch(`${baseUrl}/api/db/projects/${projectAId}/collections/${collectionName}/records`, {
      headers: { "Authorization": `Bearer ${projectBToken}` },
    });
    assert.equal(crossListRecsRes.status, 403);

    console.log("✓ Step 8 Passed: Cross-project isolation strictly enforced (all 403)");

    // 9. Path Traversal & Breakout Rejection Verification
    console.log("Step 9: Path Traversal and Input Validation Checks...");
    // Traversal in collection name
    const traversalColRes = await fetch(`${baseUrl}/api/db/projects/${projectAId}/collections/..%2f..%2fother/records`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${projectAToken}`,
      },
      body: JSON.stringify({ data: { test: 1 } }),
    });
    assert.ok(traversalColRes.status === 400 || traversalColRes.status === 403 || traversalColRes.status === 404);

    // Traversal in record ID
    const traversalRecRes = await fetch(`${baseUrl}/api/db/projects/${projectAId}/collections/${collectionName}/records/..%2f..%2fescape`, {
      headers: { "Authorization": `Bearer ${projectAToken}` },
    });
    assert.ok(traversalRecRes.status === 400 || traversalRecRes.status === 403 || traversalRecRes.status === 404);

    console.log("✓ Step 9 Passed: Traversal attempts rejected");

    // 10. Authentication & Malformed/Tampered Credentials Verification
    console.log("Step 10: Authentication Rejection on Invalid/Tampered Tokens...");
    // Missing token
    const noAuthRes = await fetch(`${baseUrl}/api/db/projects/${projectAId}/collections/${collectionName}/records`);
    assert.equal(noAuthRes.status, 401);

    // Invalid signature token
    const tamperedToken = projectAToken.slice(0, -5) + "abcde";
    const tamperedRes = await fetch(`${baseUrl}/api/db/projects/${projectAId}/collections/${collectionName}/records`, {
      headers: { "Authorization": `Bearer ${tamperedToken}` },
    });
    assert.equal(tamperedRes.status, 401);

    // Malformed token format
    const malformedRes = await fetch(`${baseUrl}/api/db/projects/${projectAId}/collections/${collectionName}/records`, {
      headers: { "Authorization": "Bearer not_a_valid_token" },
    });
    assert.equal(malformedRes.status, 401);

    console.log("✓ Step 10 Passed: Invalid/tampered authentication rejected");

    // 11. Optimistic Concurrency Conflict Rejection (Outdated SHA)
    console.log("Step 11: Optimistic Concurrency Conflict Checks...");
    const staleSha = "outdated_sha_value_12345";
    const conflictUpdateRes = await fetch(`${baseUrl}/api/db/projects/${projectAId}/collections/${collectionName}/records/${record1Id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${projectAToken}`,
      },
      body: JSON.stringify({
        data: { name: "Alice Conflicted" },
        expectedSha: staleSha,
      }),
    });
    assert.equal(conflictUpdateRes.status, 409);
    const conflictUpdateData = await conflictUpdateRes.json();
    assert.ok(conflictUpdateData.error);

    const conflictDeleteRes = await fetch(`${baseUrl}/api/db/projects/${projectAId}/collections/${collectionName}/records/${record1Id}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${projectAToken}`,
      },
      body: JSON.stringify({
        expectedSha: staleSha,
      }),
    });
    assert.equal(conflictDeleteRes.status, 409);

    console.log("✓ Step 11 Passed: Outdated SHA conflicts rejected (409 Conflict)");

    // 12. Record Deletion
    console.log("Step 12: Delete Record in Project A...");
    const deleteRes = await fetch(`${baseUrl}/api/db/projects/${projectAId}/collections/${collectionName}/records/${record1Id}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${projectAToken}` },
    });
    assert.equal(deleteRes.status, 200);

    // Verify record is gone
    const getDeletedRes = await fetch(`${baseUrl}/api/db/projects/${projectAId}/collections/${collectionName}/records/${record1Id}`, {
      headers: { "Authorization": `Bearer ${projectAToken}` },
    });
    assert.equal(getDeletedRes.status, 404);

    console.log("✓ Step 12 Passed: Record successfully deleted");

    console.log("==================================================");
    console.log("All Database Service Integration Tests PASSED!");
    console.log("==================================================");
  } finally {
    server.close();
  }
}

runDatabaseTests().catch((err) => {
  console.error("Database Test Failed with error:", err);
  process.exit(1);
});
