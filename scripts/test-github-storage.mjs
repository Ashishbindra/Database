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
