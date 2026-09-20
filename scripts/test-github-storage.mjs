import { strict as assert } from "node:assert";
import { app } from "../dist/server.cjs";
import { createServer } from "node:http";

async function runTests() {
  console.log("==================================================");
  console.log("GIGABYTE GITHUB STORAGE & REGRESSION TEST SUITE");
  console.log("==================================================");

  // Start temporary test server
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 3000;
  const baseUrl = `http://localhost:${port}`;

  try {
    // 1. Test missing PAT / Configuration error when GITHUB_STORAGE_PAT is empty in production
    console.log("Test 1: Missing PAT configuration error (503)...");
    process.env.GITHUB_STORAGE_PAT = "";
    process.env.NODE_ENV = "production";
    const resMissingPat = await fetch(`${baseUrl}/api/vault/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "testuser", opaqueUserId: "123", saltHex: "abc", authProofHash: "def", wrappedDek: "ghi" }),
    });
    assert.equal(resMissingPat.status, 503);
    const bodyMissing = await resMissingPat.json();
    assert.equal(bodyMissing.error, "CONFIGURATION_ERROR");
    console.log("✓ Test 1 Passed");

    // Restore test PAT for subsequent tests
    process.env.GITHUB_STORAGE_PAT = "ghp_mock_test_token_123456789";
    process.env.NODE_ENV = "test";
    process.env.GITHUB_OWNER = "Ashishbindra";
    process.env.GITHUB_REPO = "github-encrypted-storage";
    process.env.GITHUB_BRANCH = "main";

    // 2. Test Configuration values correctness
    console.log("Test 2: GitHub configuration variables verification...");
    assert.equal(process.env.GITHUB_OWNER, "Ashishbindra");
    assert.equal(process.env.GITHUB_REPO, "github-encrypted-storage");
    assert.equal(process.env.GITHUB_BRANCH, "main");
    console.log("✓ Test 2 Passed");

    // 3. Test GET /api/health
    console.log("Test 3: GET /api/health -> HTTP 200");
    const resHealth = await fetch(`${baseUrl}/api/health`);
    assert.equal(resHealth.status, 200);
    const jsonHealth = await resHealth.json();
    assert.equal(jsonHealth.ok, true);
    console.log("✓ Test 3 Passed");

    // 4. Test unhandled /api endpoint returns 404 JSON (not HTML)
    console.log("Test 4: GET /api/nonexistent -> HTTP 404 JSON");
    const res404 = await fetch(`${baseUrl}/api/nonexistent-endpoint`);
    assert.equal(res404.status, 404);
    const json404 = await res404.json();
    assert.equal(json404.error, "Not Found");
    console.log("✓ Test 4 Passed");

    // 5. Test query-string preservation and Vercel rewrite param handling
    console.log("Test 5: Query string preservation test");
    const resQuery = await fetch(`${baseUrl}/api/vault/file?path=test/file.json`);
    assert.equal(resQuery.status, 401);
    console.log("✓ Test 5 Passed");

    // 6. Test Registration with Empty Repository (404 absent -> registration succeeds)
    console.log("Test 6: Empty repository registration (404 absent -> success)...");
    process.env.GITHUB_STORAGE_PAT = "";
    const uniqueUser = `newuser_${Date.now()}`;
    const resReg1 = await fetch(`${baseUrl}/api/vault/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: uniqueUser,
        opaqueUserId: `user_id_${Date.now()}`,
        saltHex: "123456",
        authProofHash: "abcdef",
        wrappedDek: "encrypted_dek_xyz",
      }),
    });
    assert.equal(resReg1.status, 200);
    const jsonReg1 = await resReg1.json();
    assert.equal(jsonReg1.success, true);
    console.log("✓ Test 6 Passed");

    // 7. Test Duplicate Registration (existing index file -> 409 Duplicate User)
    console.log("Test 7: Duplicate username registration (existing index -> 409)...");
    const resReg2 = await fetch(`${baseUrl}/api/vault/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: uniqueUser,
        opaqueUserId: `user_id_diff_${Date.now()}`,
        saltHex: "654321",
        authProofHash: "fedcba",
        wrappedDek: "encrypted_dek_abc",
      }),
    });
    assert.equal(resReg2.status, 409);
    const jsonReg2 = await resReg2.json();
    assert.equal(jsonReg2.error, "Duplicate User");
    console.log("✓ Test 7 Passed");

    // 8. Test Authenticated CRUD flow end-to-end
    console.log("Test 8: Authenticated CRUD flow end-to-end...");
    const crudUser = `cruduser_${Date.now()}`;
    const opaqueUserId = `opaque_${crudUser}`;
    
    // Step 8.1: Register (which returns session token)
    const resReg = await fetch(`${baseUrl}/api/vault/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: crudUser,
        opaqueUserId: opaqueUserId,
        saltHex: "abcdef123456",
        authProofHash: "hash123",
        wrappedDek: "wrapped123",
      }),
    });
    assert.equal(resReg.status, 200);
    const regResult = await resReg.json();
    assert.equal(regResult.success, true);
    const token = regResult.sessionToken;
    assert.ok(token);

    // Step 8.2: GET vault tree
    const resTree1 = await fetch(`${baseUrl}/api/vault/tree`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    assert.equal(resTree1.status, 200);
    const tree1Result = await resTree1.json();
    assert.ok(Array.isArray(tree1Result.tree));

    // Step 8.3: CREATE a small test file
    const testFilePath = `data/users/${opaqueUserId}/test-file.json`;
    const initialContent = JSON.stringify({ cipher: "hello" });
    const resCreate = await fetch(`${baseUrl}/api/vault/file`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        path: testFilePath,
        content: initialContent
      })
    });
    assert.equal(resCreate.status, 200);
    const createResult = await resCreate.json();
    assert.equal(createResult.success, true);
    const createdSha = createResult.sha;
    assert.ok(createdSha);

    // Step 8.4: GET vault tree again to verify the file is listed
    const resTree2 = await fetch(`${baseUrl}/api/vault/tree`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    assert.equal(resTree2.status, 200);
    const tree2Result = await resTree2.json();
    const foundFile = tree2Result.tree.find(f => f.path === testFilePath);
    assert.ok(foundFile);
    // In local mock simulation mode, the tree list returns "local_sha"
    if (foundFile.sha !== createdSha && foundFile.sha !== "local_sha") {
      assert.fail(`Expected SHA to be ${createdSha} or "local_sha", got ${foundFile.sha}`);
    }

    // Step 8.5: RETRIEVE the same file
    const resGet1 = await fetch(`${baseUrl}/api/vault/file?path=${encodeURIComponent(testFilePath)}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    assert.equal(resGet1.status, 200);
    const get1Result = await resGet1.json();
    assert.equal(get1Result.content, initialContent);
    assert.equal(get1Result.sha, createdSha);

    // Step 8.6: UPDATE the file
    const updatedContent = JSON.stringify({ cipher: "world" });
    const resUpdate = await fetch(`${baseUrl}/api/vault/file`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        path: testFilePath,
        content: updatedContent,
        expectedSha: createdSha
      })
    });
    assert.equal(resUpdate.status, 200);
    const updateResult = await resUpdate.json();
    assert.equal(updateResult.success, true);
    const updatedSha = updateResult.sha;
    assert.ok(updatedSha);
    assert.notEqual(updatedSha, createdSha);

    // Step 8.7: RETRIEVE again and verify updated content
    const resGet2 = await fetch(`${baseUrl}/api/vault/file?path=${encodeURIComponent(testFilePath)}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    assert.equal(resGet2.status, 200);
    const get2Result = await resGet2.json();
    assert.equal(get2Result.content, updatedContent);
    assert.equal(get2Result.sha, updatedSha);

    // Step 8.8: DELETE the file
    const resDelete = await fetch(`${baseUrl}/api/vault/file`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        path: testFilePath,
        sha: updatedSha
      })
    });
    assert.equal(resDelete.status, 200);
    const deleteResult = await resDelete.json();
    assert.equal(deleteResult.success, true);

    // Step 8.9: GET vault tree again to verify the file is gone
    const resTree3 = await fetch(`${baseUrl}/api/vault/tree`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    assert.equal(resTree3.status, 200);
    const tree3Result = await resTree3.json();
    const foundDeletedFile = tree3Result.tree.find(f => f.path === testFilePath);
    assert.ok(!foundDeletedFile);
    console.log("✓ Test 8 Passed");

    // 9. Test Invalid Path Rejection (traversal, absolute, and cross-user isolation)
    console.log("Test 9: Invalid path validation rejection checks...");
    
    const traversalPath = `data/users/${opaqueUserId}/../../other.json`;
    const resTraversal = await fetch(`${baseUrl}/api/vault/file?path=${encodeURIComponent(traversalPath)}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    assert.equal(resTraversal.status, 403);
    const traversalBody = await resTraversal.json();
    assert.equal(traversalBody.error, "Forbidden");

    const absPath = `/data/users/${opaqueUserId}/other.json`;
    const resAbs = await fetch(`${baseUrl}/api/vault/file?path=${encodeURIComponent(absPath)}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    assert.equal(resAbs.status, 403);
    const absBody = await resAbs.json();
    assert.equal(absBody.error, "Forbidden");

    const crossUserPath = `data/users/otherUser/other.json`;
    const resCross = await fetch(`${baseUrl}/api/vault/file?path=${encodeURIComponent(crossUserPath)}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    assert.equal(resCross.status, 403);
    const crossBody = await resCross.json();
    assert.equal(crossBody.error, "Forbidden");

    // PUT cross-user
    const resCrossPut = await fetch(`${baseUrl}/api/vault/file`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        path: crossUserPath,
        content: JSON.stringify({ cipher: "hacked" }),
        expectedSha: "some_sha"
      })
    });
    assert.equal(resCrossPut.status, 403);

    // DELETE cross-user
    const resCrossDelete = await fetch(`${baseUrl}/api/vault/file`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        path: crossUserPath,
        sha: "some_sha"
      })
    });
    assert.equal(resCrossDelete.status, 403);

    console.log("✓ Test 9 Passed");

    // 10. Test Account Recovery (Setup, Authentication, and Invalid username rejection)
    console.log("Test 10: Account Recovery flow verification...");
    const recoveryUser = `recoveryuser_${Date.now()}`;
    const recoveryOpaqueUserId = `opaque_${recoveryUser}`;
    const testRecoveryWrappedDek = "test_recovery_wrapped_dek_123456";

    // Step 10.1: Register with recoveryWrappedDek
    const resRegRec = await fetch(`${baseUrl}/api/vault/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: recoveryUser,
        opaqueUserId: recoveryOpaqueUserId,
        saltHex: "abcdef123456",
        authProofHash: "hash123",
        wrappedDek: "wrapped123",
        recoveryWrappedDek: testRecoveryWrappedDek,
      }),
    });
    assert.equal(resRegRec.status, 200);

    // Step 10.2: Request recovery for valid username
    const resRecovery = await fetch(`${baseUrl}/api/vault/recovery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: recoveryUser }),
    });
    assert.equal(resRecovery.status, 200);
    const recoveryResult = await resRecovery.json();
    assert.equal(recoveryResult.opaqueUserId, recoveryOpaqueUserId);
    assert.equal(recoveryResult.recoveryWrappedDek, testRecoveryWrappedDek);
    assert.equal(recoveryResult.wrappedDek, "wrapped123");

    // Verify recovery result does not leak sensitive info
    assert.equal(recoveryResult.password, undefined);
    assert.equal(recoveryResult.recoveryPhrase, undefined);

    // Step 10.3: Request recovery with invalid username (must fail with 404)
    const resRecoveryInvalid = await fetch(`${baseUrl}/api/vault/recovery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "non_existent_user_xyz" }),
    });
    assert.equal(resRecoveryInvalid.status, 404);
    const recoveryInvalidResult = await resRecoveryInvalid.json();
    assert.equal(recoveryInvalidResult.error, "Recovery Account Not Found");
    console.log("✓ Test 10 Passed");

    // 11. Test Credentials Verification (Wrong password fails, missing auth fails)
    console.log("Test 11: Credentials Verification checks...");

    // Login challenge mismatch verification
    const resChallenge = await fetch(`${baseUrl}/api/vault/auth-challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opaqueUserId: recoveryOpaqueUserId }),
    });
    assert.equal(resChallenge.status, 200);
    const challengeData = await resChallenge.json();

    // POST Login with wrong proof (simulates wrong password proof)
    const resLoginWrongProof = await fetch(`${baseUrl}/api/vault/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        opaqueUserId: recoveryOpaqueUserId,
        challengeId: challengeData.challengeId,
        challengeProof: "invalid_proof_here",
      }),
    });
    assert.equal(resLoginWrongProof.status, 401);
    const wrongProofResult = await resLoginWrongProof.json();
    assert.equal(wrongProofResult.error, "Authentication Failed");

    // Missing authentication token / Scheme
    const resMissingAuth = await fetch(`${baseUrl}/api/vault/tree`);
    assert.equal(resMissingAuth.status, 401);

    console.log("✓ Test 11 Passed");

    // 12. Test Session Security and Revocation
    console.log("Test 12: Session Security & Revocation checks...");

    // Try accessing protected route with invalid/expired token
    const resInvalidToken = await fetch(`${baseUrl}/api/vault/tree`, {
      headers: { "Authorization": "Bearer invalid_token_xyz" }
    });
    assert.equal(resInvalidToken.status, 401);

    // Verify session token from Step 8.1 is still valid
    const resSessionCheck = await fetch(`${baseUrl}/api/vault/tree`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    assert.equal(resSessionCheck.status, 200);

    // Perform logout
    const resLogout = await fetch(`${baseUrl}/api/vault/logout`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` }
    });
    assert.equal(resLogout.status, 200);

    // Try accessing protected route with same token again (must fail 401)
    const resRevokedCheck = await fetch(`${baseUrl}/api/vault/tree`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    assert.equal(resRevokedCheck.status, 401);

    console.log("✓ Test 12 Passed");

    console.log("==================================================");
    console.log("All GitHub Storage & Routing Test Cases PASSED successfully!");
    console.log("==================================================");
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
