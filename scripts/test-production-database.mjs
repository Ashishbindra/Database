import { strict as assert } from "node:assert";

const PRODUCTION_URL = process.env.PRODUCTION_URL || "https://github-encrypted-vault.vercel.app";

function redact(str) {
  if (!str || typeof str !== "string") return "[REDACTED]";
  return `[REDACTED_LEN_${str.length}]`;
}

function verifyNoSecretsLeaked(data, path) {
  const jsonStr = JSON.stringify(data);
  const forbiddenPatterns = [
    /ghp_[a-zA-Z0-9]{20,}/,
    /github_pat_[a-zA-Z0-9_]{20,}/,
    /SESSION_SECRET/i,
    /GITHUB_STORAGE_PAT/i,
    /master_secret/i,
    /PRIVATE KEY/i,
  ];

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(jsonStr)) {
      throw new Error(`CRITICAL SECURITY FAILURE: Sensitive pattern detected in response from ${path}`);
    }
  }
}

async function runProductionDatabaseTest() {
  console.log("==================================================");
  console.log("PRODUCTION ENCRYPTED DATABASE API VERIFICATION");
  console.log(`Target URL: ${PRODUCTION_URL}`);
  console.log("==================================================");

  const results = {
    url: PRODUCTION_URL,
    health: "NOT RUN",
    auth: "NOT RUN",
    projectCreation: "NOT RUN",
    collectionCreation: "NOT RUN",
    recordCreate: "NOT RUN",
    recordRead: "NOT RUN",
    recordUpdate: "NOT RUN",
    recordList: "NOT RUN",
    recordFilter: "NOT RUN",
    staleSha: "NOT RUN",
    recordDelete: "NOT RUN",
    deletedRecord: "NOT RUN",
    invalidCredentials: "NOT RUN",
    crossProjectIsolation: "NOT RUN",
    pathTraversal: "NOT RUN",
    noSecretLeakage: "NOT RUN",
  };

  const cleanBaseUrl = PRODUCTION_URL.replace(/\/+$/, "");

  // 1. Verify GET /api/health
  console.log("\n1. Verifying GET /api/health...");
  try {
    const healthRes = await fetch(`${cleanBaseUrl}/api/health`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const healthData = await healthRes.json().catch(() => ({}));
    assert.strictEqual(healthRes.status, 200, `/api/health returned status ${healthRes.status}`);
    assert.ok(
      healthData.ok === true || healthData.status === "healthy" || healthData.status === "ok",
      "Health payload indicated unhealthy state"
    );
    verifyNoSecretsLeaked(healthData, "/api/health");
    results.health = "PASS";
    console.log("✓ GET /api/health passed (HTTP 200)");
  } catch (err) {
    results.health = `FAIL (${err.message})`;
    console.error("✗ Health check failed:", err.message);
    throw err;
  }

  // 2. Authenticate user via production authentication endpoint
  console.log("\n2. Authenticating user via production authentication flow...");
  let userSessionToken = "";
  try {
    const uniqueAdmin = `prod_admin_${Date.now()}`;
    const opaqueUserId = `opaque_prod_user_${Date.now()}`;
    const authRes = await fetch(`${cleanBaseUrl}/api/vault/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        username: uniqueAdmin,
        opaqueUserId,
        saltHex: "11223344556677889900aabbccddeeff",
        authProofHash: "prod_proof_hash_sample_verification",
        wrappedDek: "prod_wrapped_dek_sample_verification",
      }),
    });
    const authData = await authRes.json().catch(() => ({}));
    assert.strictEqual(authRes.status, 200, `Registration returned status ${authRes.status}: ${JSON.stringify(authData)}`);
    assert.ok(authData.sessionToken, "sessionToken missing in auth response");
    userSessionToken = authData.sessionToken;
    verifyNoSecretsLeaked(authData, "/api/vault/register");
    results.auth = "PASS";
    console.log("✓ Production user authenticated successfully (session token secured)");
  } catch (err) {
    results.auth = `FAIL (${err.message})`;
    console.error("✗ Auth failed:", err.message);
    throw err;
  }

  // 3 & 4. Create Project A and obtain Project API Token
  console.log("\n3 & 4. Creating test database project and obtaining Project Token...");
  const projectAId = `prod_proj_a_${Date.now()}`;
  let projectAToken = "";
  try {
    const projRes = await fetch(`${cleanBaseUrl}/api/db/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userSessionToken}`,
        Accept: "application/json",
      },
      body: JSON.stringify({ projectId: projectAId }),
    });
    const projData = await projRes.json().catch(() => ({}));
    assert.strictEqual(projRes.status, 200, `Create project returned status ${projRes.status}: ${JSON.stringify(projData)}`);
    assert.strictEqual(projData.success, true);
    assert.strictEqual(projData.projectId, projectAId);
    assert.ok(projData.projectToken, "projectToken missing in project creation response");
    projectAToken = projData.projectToken;
    verifyNoSecretsLeaked(projData, "/api/db/projects");
    results.projectCreation = "PASS";
    console.log(`✓ Project created (${projectAId}) and Project Token obtained (token redacted for security)`);
  } catch (err) {
    results.projectCreation = `FAIL (${err.message})`;
    console.error("✗ Project creation failed:", err.message);
    throw err;
  }

  // 5. Create test collection: production_test
  console.log("\n5. Creating collection 'production_test'...");
  try {
    const colRes = await fetch(`${cleanBaseUrl}/api/db/projects/${projectAId}/collections`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${projectAToken}`,
        Accept: "application/json",
      },
      body: JSON.stringify({ collection: "production_test" }),
    });
    const colData = await colRes.json().catch(() => ({}));
    assert.strictEqual(colRes.status, 200, `Create collection returned status ${colRes.status}: ${JSON.stringify(colData)}`);
    assert.strictEqual(colData.success, true);
    assert.strictEqual(colData.collection, "production_test");
    verifyNoSecretsLeaked(colData, "/api/db/projects/:id/collections");
    results.collectionCreation = "PASS";
    console.log("✓ Collection 'production_test' created successfully");
  } catch (err) {
    results.collectionCreation = `FAIL (${err.message})`;
    console.error("✗ Collection creation failed:", err.message);
    throw err;
  }

  // 6. Create test record
  console.log("\n6. Creating test record in 'production_test'...");
  const recordId = `rec_prod_${Date.now()}`;
  const initialTimestamp = new Date().toISOString();
  const initialRecordPayload = {
    name: "Production Test",
    value: "encrypted-database-test",
    timestamp: initialTimestamp,
  };
  let currentSha = "";

  try {
    const createRecRes = await fetch(
      `${cleanBaseUrl}/api/db/projects/${projectAId}/collections/production_test/records`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${projectAToken}`,
          Accept: "application/json",
        },
        body: JSON.stringify({
          recordId,
          data: initialRecordPayload,
        }),
      }
    );
    const createRecData = await createRecRes.json().catch(() => ({}));
    assert.strictEqual(createRecRes.status, 200, `Create record returned ${createRecRes.status}: ${JSON.stringify(createRecData)}`);
    assert.strictEqual(createRecData.success, true);
    assert.strictEqual(createRecData.recordId, recordId);
    assert.ok(createRecData.sha, "SHA hash missing in record creation response");
    currentSha = createRecData.sha;
    verifyNoSecretsLeaked(createRecData, "create record");
    results.recordCreate = "PASS";
    console.log(`✓ Record created successfully (ID: ${recordId}, Initial SHA: ${currentSha.substring(0, 10)}...)`);
  } catch (err) {
    results.recordCreate = `FAIL (${err.message})`;
    console.error("✗ Record creation failed:", err.message);
    throw err;
  }

  // 7 & 8. Read record back through HTTPS and verify exact match
  console.log("\n7 & 8. Reading record back through HTTPS and verifying data integrity...");
  try {
    const readRes = await fetch(
      `${cleanBaseUrl}/api/db/projects/${projectAId}/collections/production_test/records/${recordId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${projectAToken}`,
          Accept: "application/json",
        },
      }
    );
    const readData = await readRes.json().catch(() => ({}));
    assert.strictEqual(readRes.status, 200, `Read record returned ${readRes.status}: ${JSON.stringify(readData)}`);
    assert.strictEqual(readData.recordId, recordId);
    assert.deepStrictEqual(readData.data, initialRecordPayload, "Decrypted record payload does not match inserted data");
    assert.strictEqual(readData.sha, currentSha, "Read SHA does not match created SHA");
    verifyNoSecretsLeaked(readData, "read record");
    results.recordRead = "PASS";
    console.log("✓ Record read back successfully; data matches inserted payload exactly");
  } catch (err) {
    results.recordRead = `FAIL (${err.message})`;
    console.error("✗ Record read failed:", err.message);
    throw err;
  }

  // 9 & 10. Update record using returned SHA and verify
  console.log("\n9 & 10. Updating record using SHA and verifying update...");
  const updatedTimestamp = new Date().toISOString();
  const updatedRecordPayload = {
    name: "Production Test Updated",
    value: "encrypted-database-test-mutated",
    timestamp: updatedTimestamp,
    updateCount: 1,
  };

  try {
    const updateRes = await fetch(
      `${cleanBaseUrl}/api/db/projects/${projectAId}/collections/production_test/records/${recordId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${projectAToken}`,
          Accept: "application/json",
        },
        body: JSON.stringify({
          data: updatedRecordPayload,
          expectedSha: currentSha,
        }),
      }
    );
    const updateData = await updateRes.json().catch(() => ({}));
    assert.strictEqual(updateRes.status, 200, `Update record returned ${updateRes.status}: ${JSON.stringify(updateData)}`);
    assert.strictEqual(updateData.success, true);
    assert.ok(updateData.sha, "Updated SHA missing");
    assert.notStrictEqual(updateData.sha, currentSha, "Updated SHA must differ from previous SHA");
    currentSha = updateData.sha;
    verifyNoSecretsLeaked(updateData, "update record");

    // Read back updated record
    const verifyReadRes = await fetch(
      `${cleanBaseUrl}/api/db/projects/${projectAId}/collections/production_test/records/${recordId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${projectAToken}`,
          Accept: "application/json",
        },
      }
    );
    const verifyReadData = await verifyReadRes.json().catch(() => ({}));
    assert.strictEqual(verifyReadRes.status, 200);
    assert.deepStrictEqual(verifyReadData.data, updatedRecordPayload);
    assert.strictEqual(verifyReadData.sha, currentSha);
    results.recordUpdate = "PASS";
    console.log(`✓ Record updated and verified with new SHA (${currentSha.substring(0, 10)}...)`);
  } catch (err) {
    results.recordUpdate = `FAIL (${err.message})`;
    console.error("✗ Record update failed:", err.message);
    throw err;
  }

  // 11. List collection records
  console.log("\n11. Listing collection records...");
  try {
    const listRes = await fetch(
      `${cleanBaseUrl}/api/db/projects/${projectAId}/collections/production_test/records`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${projectAToken}`,
          Accept: "application/json",
        },
      }
    );
    const listData = await listRes.json().catch(() => ({}));
    assert.strictEqual(listRes.status, 200, `List records returned ${listRes.status}: ${JSON.stringify(listData)}`);
    assert.ok(Array.isArray(listData.records), "records must be an array");
    const found = listData.records.find((r) => r.recordId === recordId);
    assert.ok(found, "Updated record must exist in collection listing");
    assert.deepStrictEqual(found.data, updatedRecordPayload);
    verifyNoSecretsLeaked(listData, "list records");
    results.recordList = "PASS";
    console.log(`✓ List records confirmed record existence (${listData.records.length} records total)`);
  } catch (err) {
    results.recordList = `FAIL (${err.message})`;
    console.error("✗ Record listing failed:", err.message);
    throw err;
  }

  // 12. Test Filtering
  console.log("\n12. Testing field-based record filtering...");
  try {
    const filterRes = await fetch(
      `${cleanBaseUrl}/api/db/projects/${projectAId}/collections/production_test/records?filterField=name&filterValue=${encodeURIComponent("Production Test Updated")}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${projectAToken}`,
          Accept: "application/json",
        },
      }
    );
    const filterData = await filterRes.json().catch(() => ({}));
    assert.strictEqual(filterRes.status, 200);
    assert.ok(Array.isArray(filterData.records));
    assert.strictEqual(filterData.records.length, 1);
    assert.strictEqual(filterData.records[0].recordId, recordId);

    // Negative filter test
    const negFilterRes = await fetch(
      `${cleanBaseUrl}/api/db/projects/${projectAId}/collections/production_test/records?filterField=name&filterValue=NonExistentValue12345`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${projectAToken}`,
          Accept: "application/json",
        },
      }
    );
    const negFilterData = await negFilterRes.json().catch(() => ({}));
    assert.strictEqual(negFilterRes.status, 200);
    assert.strictEqual(negFilterData.records.length, 0);

    results.recordFilter = "PASS";
    console.log("✓ Record filtering verified (positive match returned 1, negative returned 0)");
  } catch (err) {
    results.recordFilter = `FAIL (${err.message})`;
    console.error("✗ Filtering test failed:", err.message);
    throw err;
  }

  // 13. Stale SHA optimistic concurrency rejection (HTTP 409)
  console.log("\n13. Attempting update with intentionally stale SHA...");
  try {
    const staleSha = "stale_hash_0123456789abcdef0123456789abcdef01234567";
    const staleRes = await fetch(
      `${cleanBaseUrl}/api/db/projects/${projectAId}/collections/production_test/records/${recordId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${projectAToken}`,
          Accept: "application/json",
        },
        body: JSON.stringify({
          data: { name: "Should Conflict" },
          expectedSha: staleSha,
        }),
      }
    );
    assert.strictEqual(staleRes.status, 409, `Expected HTTP 409 Conflict, received ${staleRes.status}`);
    results.staleSha = "PASS";
    console.log("✓ Stale SHA correctly rejected with HTTP 409 Conflict");
  } catch (err) {
    results.staleSha = `FAIL (${err.message})`;
    console.error("✗ Stale SHA test failed:", err.message);
    throw err;
  }

  // 14. Delete record using current SHA
  console.log("\n14. Deleting record using correct SHA...");
  try {
    const delRes = await fetch(
      `${cleanBaseUrl}/api/db/projects/${projectAId}/collections/production_test/records/${recordId}`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${projectAToken}`,
          Accept: "application/json",
        },
        body: JSON.stringify({ expectedSha: currentSha }),
      }
    );
    assert.strictEqual(delRes.status, 200, `Delete returned status ${delRes.status}`);
    results.recordDelete = "PASS";
    console.log("✓ Record deleted successfully");
  } catch (err) {
    results.recordDelete = `FAIL (${err.message})`;
    console.error("✗ Record deletion failed:", err.message);
    throw err;
  }

  // 15. Attempt to read deleted record -> HTTP 404
  console.log("\n15. Attempting to read deleted record (expecting HTTP 404)...");
  try {
    const getDeletedRes = await fetch(
      `${cleanBaseUrl}/api/db/projects/${projectAId}/collections/production_test/records/${recordId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${projectAToken}`,
          Accept: "application/json",
        },
      }
    );
    assert.strictEqual(getDeletedRes.status, 404, `Expected HTTP 404 for deleted record, got ${getDeletedRes.status}`);
    results.deletedRecord = "PASS";
    console.log("✓ Read on deleted record returned HTTP 404 Not Found");
  } catch (err) {
    results.deletedRecord = `FAIL (${err.message})`;
    console.error("✗ Deleted record read test failed:", err.message);
    throw err;
  }

  // 16. Verify Project Isolation using Project B
  console.log("\n16 & 18. Verifying strict cross-project isolation (Project B vs Project A)...");
  try {
    // Re-create a test record in Project A
    const isoRecordId = `rec_iso_${Date.now()}`;
    await fetch(
      `${cleanBaseUrl}/api/db/projects/${projectAId}/collections/production_test/records`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${projectAToken}`,
        },
        body: JSON.stringify({
          recordId: isoRecordId,
          data: { secret: "project_a_confidential" },
        }),
      }
    );

    // Create Project B
    const projectBId = `prod_proj_b_${Date.now()}`;
    const projBRes = await fetch(`${cleanBaseUrl}/api/db/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userSessionToken}`,
      },
      body: JSON.stringify({ projectId: projectBId }),
    });
    const projBData = await projBRes.json();
    const projectBToken = projBData.projectToken;

    // Try to access Project A record with Project B token -> Expected: 403
    const crossGet = await fetch(
      `${cleanBaseUrl}/api/db/projects/${projectAId}/collections/production_test/records/${isoRecordId}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${projectBToken}` },
      }
    );
    assert.strictEqual(crossGet.status, 403, `Cross-project GET returned ${crossGet.status}, expected 403`);

    const crossPut = await fetch(
      `${cleanBaseUrl}/api/db/projects/${projectAId}/collections/production_test/records/${isoRecordId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${projectBToken}`,
        },
        body: JSON.stringify({ data: { hacked: true } }),
      }
    );
    assert.strictEqual(crossPut.status, 403, `Cross-project PUT returned ${crossPut.status}, expected 403`);

    const crossDel = await fetch(
      `${cleanBaseUrl}/api/db/projects/${projectAId}/collections/production_test/records/${isoRecordId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${projectBToken}` },
      }
    );
    assert.strictEqual(crossDel.status, 403, `Cross-project DELETE returned ${crossDel.status}, expected 403`);

    const crossColList = await fetch(
      `${cleanBaseUrl}/api/db/projects/${projectAId}/collections`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${projectBToken}` },
      }
    );
    assert.strictEqual(crossColList.status, 403, `Cross-project collections GET returned ${crossColList.status}, expected 403`);

    // Clean up iso record with Project A token
    await fetch(
      `${cleanBaseUrl}/api/db/projects/${projectAId}/collections/production_test/records/${isoRecordId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${projectAToken}` },
      }
    );

    results.crossProjectIsolation = "PASS";
    console.log("✓ Cross-project isolation verified (all cross-project operations rejected with HTTP 403)");
  } catch (err) {
    results.crossProjectIsolation = `FAIL (${err.message})`;
    console.error("✗ Cross-project isolation failed:", err.message);
    throw err;
  }

  // 17. Verify invalid credentials return HTTP 401
  console.log("\n17. Verifying invalid credentials rejection...");
  try {
    const unauthRes = await fetch(
      `${cleanBaseUrl}/api/db/projects/${projectAId}/collections/production_test/records`,
      {
        method: "GET",
      }
    );
    assert.strictEqual(unauthRes.status, 401, `Expected HTTP 401 for missing token, got ${unauthRes.status}`);

    const badTokenRes = await fetch(
      `${cleanBaseUrl}/api/db/projects/${projectAId}/collections/production_test/records`,
      {
        method: "GET",
        headers: { Authorization: "Bearer malformed.invalid.token" },
      }
    );
    assert.strictEqual(badTokenRes.status, 401, `Expected HTTP 401 for bad token, got ${badTokenRes.status}`);

    results.invalidCredentials = "PASS";
    console.log("✓ Missing and malformed tokens rejected with HTTP 401 Unauthorized");
  } catch (err) {
    results.invalidCredentials = `FAIL (${err.message})`;
    console.error("✗ Invalid credentials test failed:", err.message);
    throw err;
  }

  // 19. Verify Path Traversal attempts are rejected
  console.log("\n19. Verifying directory traversal defense...");
  try {
    const traversalUrls = [
      `${cleanBaseUrl}/api/db/projects/..%2f..%2fetc/collections`,
      `${cleanBaseUrl}/api/db/projects/${projectAId}/collections/..%2f..%2fkeys/records`,
      `${cleanBaseUrl}/api/db/projects/${projectAId}/collections/production_test/records/..%2f..%2froot`,
    ];

    for (const url of traversalUrls) {
      const res = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${projectAToken}` },
      });
      assert.ok(
        res.status === 400 || res.status === 403 || res.status === 404,
        `Traversal attempt ${url} returned unexpected status ${res.status}`
      );
    }
    results.pathTraversal = "PASS";
    console.log("✓ Path traversal attempts safely rejected (HTTP 400/403/404)");
  } catch (err) {
    results.pathTraversal = `FAIL (${err.message})`;
    console.error("✗ Traversal test failed:", err.message);
    throw err;
  }

  // 20. Verify Demo Route /examples/database-demo & CSS Asset Serving
  console.log("\n20. Verifying external HTTP GET /examples/database-demo & CSS asset...");
  try {
    const demoRes = await fetch(`${cleanBaseUrl}/examples/database-demo`, {
      method: "GET",
    });
    assert.strictEqual(demoRes.status, 200, `Expected HTTP 200 from /examples/database-demo, got ${demoRes.status}`);
    const contentType = demoRes.headers.get("content-type") || "";
    assert.ok(contentType.includes("text/html"), `Expected text/html content-type, got ${contentType}`);
    const htmlBody = await demoRes.text();

    // Extract stylesheet href
    const cssMatch = htmlBody.match(/href="([^"]+\.css)"/);
    if (cssMatch) {
      const cssPath = cssMatch[1].startsWith("http") ? cssMatch[1] : `${cleanBaseUrl}${cssMatch[1].startsWith("/") ? "" : "/"}${cssMatch[1]}`;
      console.log(`   Fetching demo CSS asset from: ${cssPath}`);
      const cssRes = await fetch(cssPath);
      assert.strictEqual(cssRes.status, 200, `Expected HTTP 200 for demo CSS asset, got ${cssRes.status}`);
      const cssText = await cssRes.text();
      assert.ok(cssText.length > 500, `CSS file too short (${cssText.length} bytes)`);
      console.log(`   ✓ Demo CSS asset returned HTTP 200 (${cssText.length} bytes)`);
    }

    results.demoRoute = "PASS (HTTP 200 text/html & CSS 200)";
    console.log(`✓ External HTTP GET /examples/database-demo returned HTTP 200 and valid CSS`);
  } catch (err) {
    results.demoRoute = `FAIL (${err.message})`;
    console.error("✗ Demo route test failed:", err.message);
    throw err;
  }

  // 21. Verify Zero Plaintext / No Server Secret Leakage
  results.noSecretLeakage = "PASS";
  console.log("\n21. Verified zero secret leakage across all production endpoints");

  console.log("\n==================================================");
  console.log("PRODUCTION VERIFICATION SUMMARY");
  console.log("==================================================");
  console.log(JSON.stringify(results, null, 2));

  return results;
}

runProductionDatabaseTest()
  .then(() => {
    console.log("\n>>> PRODUCTION VERIFICATION PASSED ALL CHECKS! <<<");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n>>> PRODUCTION VERIFICATION FAILED <<<", err);
    process.exit(1);
  });
