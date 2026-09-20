import { strict as assert } from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { EncryptedDatabaseClient, DatabaseApiError } from "../examples/database-demo/src/client/EncryptedDatabaseClient.ts";

const PRODUCTION_URL = process.env.PRODUCTION_URL || "https://github-encrypted-vault.vercel.app";

async function runDemoIntegrationTest() {
  console.log("==================================================");
  console.log("DATABASE DEMO APP - PRODUCTION INTEGRATION TEST");
  console.log(`Target URL: ${PRODUCTION_URL}`);
  console.log("==================================================");

  // 1. Static Security Audit of Demo Codebase
  console.log("\n1. Performing Static Security Audit of Demo App...");
  const demoSrcDir = path.resolve(process.cwd(), "examples/database-demo/src");
  const filesToScan = [];

  function collectFiles(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const fullPath = path.join(dir, e.name);
      if (e.isDirectory()) {
        collectFiles(fullPath);
      } else if (/\.(ts|tsx|js|jsx|json|html|css)$/.test(e.name)) {
        filesToScan.push(fullPath);
      }
    }
  }

  collectFiles(demoSrcDir);

  const forbiddenStrings = [
    "GITHUB_STORAGE_PAT",
    "SESSION_SECRET",
    "process.env.GITHUB",
    "process.env.SESSION",
    "src/server",
    "Octokit",
    "@octokit",
  ];

  for (const filePath of filesToScan) {
    const content = fs.readFileSync(filePath, "utf-8");
    for (const forbidden of forbiddenStrings) {
      if (content.includes(forbidden)) {
        throw new Error(`SECURITY VIOLATION: Forbidden token "${forbidden}" found in demo source file: ${filePath}`);
      }
    }
  }
  console.log(`✓ Scanned ${filesToScan.length} demo source files: Zero server secrets or server imports found.`);

  // 2. Provision Demo Project on Production Backend via HTTPS
  console.log("\n2. Provisioning Demo User & Project on Production...");
  const cleanUrl = PRODUCTION_URL.replace(/\/+$/, "");
  const authRes = await fetch(`${cleanUrl}/api/vault/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: `demo_app_tester_${Date.now()}`,
      opaqueUserId: `demo_opaque_${Date.now()}`,
      saltHex: "0102030405060708090a0b0c0d0e0f10",
      authProofHash: "demo_test_proof_hash",
      wrappedDek: "demo_test_wrapped_dek",
    }),
  });

  assert.strictEqual(authRes.status, 200, "Registration on production failed");
  const authData = await authRes.json();
  const sessionToken = authData.sessionToken;

  const testProjectId = `demo_project_${Date.now()}`;
  const client = new EncryptedDatabaseClient({
    baseUrl: cleanUrl,
    userSessionToken: sessionToken,
  });

  const projectResult = await client.createProject(testProjectId);
  assert.strictEqual(projectResult.projectId, testProjectId);
  assert.ok(projectResult.projectToken, "Project token not returned");
  console.log(`✓ Project "${testProjectId}" provisioned successfully`);

  // Configure Client with Project API Token
  client.setProject(testProjectId, projectResult.projectToken);

  // 3. Collection Management: Create 'customers' collection
  console.log("\n3. Creating collection 'customers'...");
  const colRes = await client.createCollection("customers");
  assert.strictEqual(colRes.success, true);
  const collections = await client.listCollections();
  assert.ok(collections.includes("customers"), "'customers' collection not found in list");
  console.log(`✓ Collections verified: [${collections.join(", ")}]`);

  // 4. Create Customer Record
  console.log("\n4. Creating Customer Record...");
  const customerId = `cust_test_${Date.now()}`;
  const customerPayload = {
    name: "Jane Smith Demo",
    email: "jane.smith.demo@example.com",
    phone: "+1 555-0144",
    tier: "Premium",
    notes: "Enterprise integration prospect",
  };

  const createRes = await client.createRecord("customers", customerPayload, customerId);
  assert.strictEqual(createRes.success, true);
  assert.strictEqual(createRes.recordId, customerId);
  assert.ok(createRes.sha, "Commit SHA missing on create");
  let currentSha = createRes.sha;
  console.log(`✓ Customer created (ID: ${customerId}, SHA: ${currentSha.substring(0, 10)}...)`);

  // 5. Read Customer Record
  console.log("\n5. Reading Customer Record...");
  const readRes = await client.getRecord("customers", customerId);
  assert.strictEqual(readRes.recordId, customerId);
  assert.strictEqual(readRes.data.name, customerPayload.name);
  assert.strictEqual(readRes.data.email, customerPayload.email);
  assert.strictEqual(readRes.data.phone, customerPayload.phone);
  assert.strictEqual(readRes.data.tier, customerPayload.tier);
  assert.strictEqual(readRes.sha, currentSha);
  console.log("✓ Customer record read and verified exact payload match");

  // 6. Update Customer Record
  console.log("\n6. Updating Customer Record with Optimistic Concurrency...");
  const updatedPayload = {
    ...customerPayload,
    tier: "Enterprise",
    phone: "+1 555-9988",
  };

  const updateRes = await client.updateRecord("customers", customerId, updatedPayload, currentSha);
  assert.strictEqual(updateRes.success, true);
  assert.notStrictEqual(updateRes.sha, currentSha);
  currentSha = updateRes.sha;

  // Read back and verify update
  const verifyUpdate = await client.getRecord("customers", customerId);
  assert.strictEqual(verifyUpdate.data.tier, "Enterprise");
  assert.strictEqual(verifyUpdate.data.phone, "+1 555-9988");
  assert.strictEqual(verifyUpdate.sha, currentSha);
  console.log(`✓ Customer updated successfully to Enterprise tier (New SHA: ${currentSha.substring(0, 10)}...)`);

  // 7. Search & Filter Customer
  console.log("\n7. Searching & Filtering Customer Records...");
  const matchingRecords = await client.listRecords("customers", {
    filterField: "email",
    filterValue: "jane.smith.demo@example.com",
  });
  assert.strictEqual(matchingRecords.length, 1);
  assert.strictEqual(matchingRecords[0].recordId, customerId);

  const nonMatchingRecords = await client.listRecords("customers", {
    filterField: "email",
    filterValue: "non_existent_demo_email@example.com",
  });
  assert.strictEqual(nonMatchingRecords.length, 0);
  console.log("✓ Server-side search & filtering verified");

  // 8. Stale SHA Optimistic Concurrency Check
  console.log("\n8. Verifying Stale SHA Rejection (HTTP 409)...");
  try {
    await client.updateRecord("customers", customerId, { ...updatedPayload, name: "Collision" }, "stale_hash_demo");
    assert.fail("Should have thrown DatabaseApiError with status 409");
  } catch (err) {
    assert.ok(err instanceof DatabaseApiError);
    assert.strictEqual(err.status, 409, `Expected 409, got ${err.status}`);
    console.log("✓ Stale SHA correctly rejected with DatabaseApiError (HTTP 409)");
  }

  // 9. Delete Customer Record
  console.log("\n9. Deleting Customer Record...");
  const delRes = await client.deleteRecord("customers", customerId, currentSha);
  assert.strictEqual(delRes.success, true);

  // Verify 404 on deleted record
  try {
    await client.getRecord("customers", customerId);
    assert.fail("Should have returned 404 for deleted record");
  } catch (err) {
    assert.ok(err instanceof DatabaseApiError);
    assert.strictEqual(err.status, 404);
    console.log("✓ Customer record deleted and confirmed 404 Not Found");
  }

  console.log("\n==================================================");
  console.log("ALL DEMO APP INTEGRATION TESTS PASSED!");
  console.log("==================================================");
}

runDemoIntegrationTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Demo integration test failed:", err);
    process.exit(1);
  });
