/**
 * Phase 5 Developer Release, SDK Packaging & Onboarding Verification Test Suite
 * 
 * Verifies:
 * 1. SDK build artifacts in dist/sdk (ESM, CJS, d.ts)
 * 2. SDK exports & HTTP-only architecture (no server secret leaks)
 * 3. Developer Onboarding flow endpoints & documentation files
 * 4. Multi-language code snippet templates
 * 5. Full REST API CRUD, isolation, concurrency, and error handling
 */

import fs from "fs";
import path from "path";
import http from "http";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runPhase5Tests() {
  console.log("==================================================");
  console.log("🚀 PHASE 5 DEVELOPER RELEASE & SDK PACKAGING AUDIT");
  console.log("==================================================\n");

  // TEST 1: Verify SDK build artifacts exist
  console.log("📦 1. SDK Distribution Artifacts Verification");
  const esmExists = fs.existsSync(path.join(process.cwd(), "dist/sdk/index.js"));
  const cjsExists = fs.existsSync(path.join(process.cwd(), "dist/sdk/index.cjs"));
  const dtsExists = fs.existsSync(path.join(process.cwd(), "dist/sdk/index.d.ts"));
  
  assert(esmExists, "dist/sdk/index.js (ESM bundle) exists");
  assert(cjsExists, "dist/sdk/index.cjs (CommonJS bundle) exists");
  assert(dtsExists, "dist/sdk/index.d.ts (TypeScript definitions) exists");

  // TEST 2: Verify package.json distribution configuration
  console.log("\n📄 2. Package.json SDK Configuration");
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
  assert(pkg.main === "./dist/sdk/index.cjs", "package.json main points to ./dist/sdk/index.cjs");
  assert(pkg.module === "./dist/sdk/index.js", "package.json module points to ./dist/sdk/index.js");
  assert(pkg.types === "./dist/sdk/index.d.ts", "package.json types points to ./dist/sdk/index.d.ts");
  assert(pkg.exports && pkg.exports["."], "package.json modern exports map configured");

  // TEST 3: Verify Security & Secret Decoupling (No server secrets in SDK)
  console.log("\n🔒 3. SDK Source Code Security & Leak Prevention");
  const sdkSource = fs.readFileSync(path.join(process.cwd(), "src/sdk/database/EncryptedDatabaseClient.ts"), "utf8");
  const sdkDist = fs.readFileSync(path.join(process.cwd(), "dist/sdk/index.js"), "utf8");
  
  assert(!sdkSource.includes("GITHUB_STORAGE_PAT"), "SDK source does not reference GITHUB_STORAGE_PAT");
  assert(!sdkSource.includes("SESSION_SECRET"), "SDK source does not reference SESSION_SECRET");
  assert(!sdkDist.includes("GITHUB_STORAGE_PAT"), "SDK bundled output does not contain GITHUB_STORAGE_PAT");
  assert(!sdkDist.includes("SESSION_SECRET"), "SDK bundled output does not contain SESSION_SECRET");

  // TEST 4: Verify Documentation Structure
  console.log("\n📚 4. Documentation Files Verification");
  const requiredDocs = [
    "docs/SDK.md",
    "docs/quickstart.md",
    "docs/authentication.md",
    "docs/projects.md",
    "docs/collections.md",
    "docs/records.md",
    "docs/filtering.md",
    "docs/concurrency.md",
    "docs/errors.md",
    "docs/security.md",
    "docs/README.md",
    "examples/database-demo/README.md"
  ];

  for (const doc of requiredDocs) {
    const docPath = path.join(process.cwd(), doc);
    assert(fs.existsSync(docPath), `Doc exists: ${doc}`);
    const content = fs.readFileSync(docPath, "utf8");
    assert(content.length > 50, `Doc ${doc} is populated (${content.length} bytes)`);
  }

  // TEST 5: Verify Live Server Endpoints & Developer Flow
  console.log("\n🌐 5. Live Server REST API & Onboarding Flow Verification");
  
  // 5.1 Health Check
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  assert(healthRes.ok, "GET /api/health returns HTTP 200");
  const healthData = await healthRes.json();
  assert(healthData.status === "ok" || healthData.status === "healthy" || healthData.ok === true, "Health status is healthy/ok");

  // 5.2 Create Session
  const testUser = `dev_${Date.now().toString(36)}`;
  const regRes = await fetch(`${BASE_URL}/api/vault/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: testUser,
      opaqueUserId: `opaque_${testUser}`,
      saltHex: "0123456789abcdef0123456789abcdef",
      authProofHash: "fedcba9876543210fedcba9876543210",
      wrappedDek: "wrapped_dek_demo_data"
    })
  });
  assert(regRes.ok, "POST /api/vault/register returns session");
  const regData = await regRes.json();
  const sessionToken = regData.sessionToken;
  assert(Boolean(sessionToken), "Session token obtained");

  // 5.3 Step 1: Create Project
  const testProjId = `phase5_${Date.now().toString(36)}`;
  const createProjRes = await fetch(`${BASE_URL}/api/db/projects`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${sessionToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ projectId: testProjId })
  });
  assert(createProjRes.ok, `POST /api/db/projects creates project '${testProjId}'`);
  const createProjData = await createProjRes.json();
  const projectToken = createProjData.projectToken;
  assert(Boolean(projectToken), "Project token was generated");

  // 5.3 Step 3: Create Collection
  const createColRes = await fetch(`${BASE_URL}/api/db/projects/${testProjId}/collections`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${projectToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ collection: "onboarding_users" })
  });
  assert(createColRes.ok, "POST /api/db/projects/:id/collections creates collection");

  // 5.4 Step 4: Create First Record
  const createRecRes = await fetch(`${BASE_URL}/api/db/projects/${testProjId}/collections/onboarding_users/records`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${projectToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      data: { name: "Alan Turing", role: "pioneer", active: true },
      recordId: "rec_onboarding_001"
    })
  });
  assert(createRecRes.ok, "POST /records creates encrypted record");
  const createRecData = await createRecRes.json();
  const initialSha = createRecData.sha;
  assert(Boolean(initialSha), "Record write returned Git blob SHA");

  // 5.5 Step 6: Verify Live Round-Trip Read
  const getRecRes = await fetch(`${BASE_URL}/api/db/projects/${testProjId}/collections/onboarding_users/records/rec_onboarding_001`, {
    headers: { "Authorization": `Bearer ${projectToken}` }
  });
  assert(getRecRes.ok, "GET /records/:id returns decrypted record");
  const getRecData = await getRecRes.json();
  assert(getRecData.data.name === "Alan Turing", "Decrypted data payload matches");
  assert(getRecData.sha === initialSha, "Decrypted record SHA matches write SHA");

  // 5.6 Verify Raw Ciphertext Envelope
  const getRawRes = await fetch(`${BASE_URL}/api/db/projects/${testProjId}/collections/onboarding_users/records/rec_onboarding_001/raw`, {
    headers: { "Authorization": `Bearer ${projectToken}` }
  });
  assert(getRawRes.ok, "GET /records/:id/raw returns ciphertext envelope");
  const getRawData = await getRawRes.json();
  assert(getRawData.isEncrypted === true, "isEncrypted flag is true");
  assert(Boolean(getRawData.rawPersistedContent), "rawPersistedContent contains ciphertext");

  // 5.7 Optimistic Concurrency 409 Conflict check
  const conflictRes = await fetch(`${BASE_URL}/api/db/projects/${testProjId}/collections/onboarding_users/records/rec_onboarding_001`, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${projectToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      data: { name: "Alan Turing", role: "legend" },
      sha: "outdated_sha_0000000000000000000000000000000000000000"
    })
  });
  assert(conflictRes.status === 409, "Outdated SHA returns HTTP 409 Conflict");

  // 5.8 Project Boundary Isolation (Cross-Project Access Rejected)
  const crossProjRes = await fetch(`${BASE_URL}/api/db/projects/foreign_forbidden_proj/collections/onboarding_users/records`, {
    headers: { "Authorization": `Bearer ${projectToken}` }
  });
  assert(crossProjRes.status === 403 || crossProjRes.status === 401, "Cross-project request rejected with 403/401");

  // 5.9 REGRESSION TEST: SDK Window.fetch context & Developer Onboarding 'my-test-app' creation
  console.log("\n🧪 6. Regression: Developer Onboarding 'Create Project' with Window.fetch binding");
  
  // Import compiled SDK
  const { EncryptedDatabaseClient } = await import("../dist/sdk/index.js");
  
  // Create mock window object with strict this-binding check
  const mockWindow = {
    name: "MockWindow",
    fetch: function(url, opts) {
      if (this !== mockWindow && this !== globalThis && typeof this !== "undefined") {
        throw new TypeError("'fetch' called on an object that does not implement interface Window.");
      }
      return fetch(url, opts);
    }
  };

  // Test client with window-bound fetch implementation
  const onboardingClient = new EncryptedDatabaseClient({
    baseUrl: BASE_URL,
    userSessionToken: sessionToken,
    fetchFn: mockWindow.fetch.bind(mockWindow)
  });

  const testAppProject = await onboardingClient.createProject("my-test-app");
  assert(testAppProject.projectId === "my-test-app", "Onboarding created project 'my-test-app' via SDK");
  assert(Boolean(testAppProject.projectToken), "Onboarding received valid projectToken for 'my-test-app'");

  // Verify created project in list
  const userProjects = await onboardingClient.listProjects();
  assert(userProjects.some(p => p.projectId === "my-test-app"), "'my-test-app' listed in user projects");

  // Verify collections and record creation in 'my-test-app'
  onboardingClient.setProject("my-test-app", testAppProject.projectToken);
  const colRes = await onboardingClient.createCollection("users");
  assert(colRes.success === true, "Collection 'users' created in 'my-test-app'");

  const recRes = await onboardingClient.createRecord("users", {
    appName: "my-test-app",
    status: "verified",
    timestamp: new Date().toISOString()
  }, "rec_test_init");
  assert(recRes.recordId === "rec_test_init", "Record 'rec_test_init' inserted into 'my-test-app'");

  const readRec = await onboardingClient.getRecord("users", "rec_test_init");
  assert(readRec.data.appName === "my-test-app", "Record verified in 'my-test-app'");

  console.log("\n==================================================");
  console.log(`🎉 ALL ${passedTests}/${totalTests} PHASE 5 TESTS PASSED SUCCESSFULLY!`);
  console.log("==================================================");
}

runPhase5Tests().catch(err => {
  console.error("Phase 5 Audit Failure:", err);
  process.exit(1);
});
