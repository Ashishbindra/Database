import { strict as assert } from "node:assert";
import { app } from "../dist/server.cjs";
import { createServer } from "node:http";
import crypto from "node:crypto";
import { EncryptedDatabaseClient } from "../src/sdk/database/EncryptedDatabaseClient.ts";

async function main() {
  console.log("==================================================");
  console.log("PHASE 4: FINAL PRODUCTION AUDIT & HARDENING TEST SUITE");
  console.log("==================================================");

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 3000;
  const baseUrl = `http://localhost:${port}`;

  console.log(`Targeting local audit server: ${baseUrl}\n`);

  let passed = 0;
  let failed = 0;

  async function runAuditTest(name, fn) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    Error: ${err.message}`);
      if (err.stack) {
        console.error(`    Stack: ${err.stack.split("\n").slice(1, 4).join("\n")}`);
      }
      failed++;
    }
  }

  // --- Step 0: Setup User & Two Separate Projects for Isolation Testing ---
  const auditUser = `audit_user_${Date.now()}`;
  const opaqueUserId = `opaque_audit_${Date.now()}`;
  let userSessionToken = "";
  let projectAId = `proj_a_${Date.now()}`;
  let projectBId = `proj_b_${Date.now()}`;
  let projectAToken = "";
  let projectBToken = "";

  try {
    console.log("[1. AUTHENTICATION & SESSION MANAGEMENT]");

    await runAuditTest("User registration with opaque ID and salt", async () => {
      const regRes = await fetch(`${baseUrl}/api/vault/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: auditUser,
          opaqueUserId,
          saltHex: "aabbccddeeff00112233",
          authProofHash: "proofhash_audit_phase4",
          wrappedDek: "wrappeddek_audit_phase4"
        })
      });
      assert.equal(regRes.status, 200, "Registration returns 200");
      const regJson = await regRes.json();
      assert.ok(regJson.sessionToken, "Registration returns sessionToken");
      userSessionToken = regJson.sessionToken;
    });

    await runAuditTest("Reject unauthorized requests without session header", async () => {
      const res = await fetch(`${baseUrl}/api/db/projects`);
      assert.equal(res.status, 401, "Protected route returns 401 without auth");
      const json = await res.json();
      assert.equal(json.error, "Unauthorized");
    });

    await runAuditTest("Reject malformed or tampered session tokens", async () => {
      const res = await fetch(`${baseUrl}/api/db/projects`, {
        headers: { Authorization: "Bearer tampered.invalid.session.id" }
      });
      assert.equal(res.status, 401, "Tampered session returns 401");
      const json = await res.json();
      assert.equal(json.error, "Unauthorized");
    });

    await runAuditTest("Create Project A and Project B with cryptographically signed tokens", async () => {
      const createA = await fetch(`${baseUrl}/api/db/projects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userSessionToken}`
        },
        body: JSON.stringify({ projectId: projectAId })
      });
      assert.equal(createA.status, 200);
      const jsonA = await createA.json();
      projectAToken = jsonA.projectToken;
      assert.ok(projectAToken, "Project A token received");

      const createB = await fetch(`${baseUrl}/api/db/projects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userSessionToken}`
        },
        body: JSON.stringify({ projectId: projectBId })
      });
      assert.equal(createB.status, 200);
      const jsonB = await createB.json();
      projectBToken = jsonB.projectToken;
      assert.ok(projectBToken, "Project B token received");
    });

    console.log("\n[2. MULTI-TENANT ISOLATION]");

    await runAuditTest("Project A can create collection and insert record into Project A", async () => {
      const colRes = await fetch(`${baseUrl}/api/db/projects/${projectAId}/collections`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${projectAToken}`
        },
        body: JSON.stringify({ collection: "secrets" })
      });
      assert.equal(colRes.status, 200);

      const recRes = await fetch(`${baseUrl}/api/db/projects/${projectAId}/collections/secrets/records`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${projectAToken}`
        },
        body: JSON.stringify({ recordId: "rec_a1", data: { secretKey: "project_a_private_data" } })
      });
      assert.equal(recRes.status, 200);
    });

    await runAuditTest("Project B is strictly forbidden from reading Project A records", async () => {
      const res = await fetch(`${baseUrl}/api/db/projects/${projectAId}/collections/secrets/records/rec_a1`, {
        headers: { Authorization: `Bearer ${projectBToken}` }
      });
      assert.equal(res.status, 403, "Project B token on Project A record returns 403");
      const json = await res.json();
      assert.equal(json.error, "Forbidden");
    });

    await runAuditTest("Project B is strictly forbidden from listing Project A collections", async () => {
      const res = await fetch(`${baseUrl}/api/db/projects/${projectAId}/collections`, {
        headers: { Authorization: `Bearer ${projectBToken}` }
      });
      assert.equal(res.status, 403, "Project B token on Project A collections returns 403");
    });

    await runAuditTest("Project B is strictly forbidden from viewing Project A stats", async () => {
      const res = await fetch(`${baseUrl}/api/db/projects/${projectAId}/stats`, {
        headers: { Authorization: `Bearer ${projectBToken}` }
      });
      assert.equal(res.status, 403, "Project B token on Project A stats returns 403");
    });

    await runAuditTest("Project B is strictly forbidden from viewing Project A raw envelope", async () => {
      const res = await fetch(`${baseUrl}/api/db/projects/${projectAId}/collections/secrets/records/rec_a1/raw`, {
        headers: { Authorization: `Bearer ${projectBToken}` }
      });
      assert.equal(res.status, 403, "Project B token on Project A raw envelope returns 403");
    });

    console.log("\n[3. ENCRYPTION & KEY DERIVATION AUDIT]");

    await runAuditTest("Raw stored envelopes contain only IV, Ciphertext, and Auth Tag with no plaintext", async () => {
      const rawRes = await fetch(`${baseUrl}/api/db/projects/${projectAId}/collections/secrets/records/rec_a1/raw`, {
        headers: { Authorization: `Bearer ${projectAToken}` }
      });
      assert.equal(rawRes.status, 200);
      const rawJson = await rawRes.json();
      assert.ok(rawJson.isEncrypted, "Envelope marked encrypted");

      const parsedEnvelope = JSON.parse(rawJson.rawPersistedContent);
      assert.ok(parsedEnvelope.iv && typeof parsedEnvelope.iv === "string", "IV exists in envelope");
      assert.ok(parsedEnvelope.ciphertext && typeof parsedEnvelope.ciphertext === "string", "Ciphertext exists in envelope");
      assert.ok(parsedEnvelope.tag && typeof parsedEnvelope.tag === "string", "Auth tag exists in envelope");
      assert.ok(!rawJson.rawPersistedContent.includes("project_a_private_data"), "Plaintext data is never stored in raw payload");
    });

    await runAuditTest("Consecutive writes generate unique 12-byte IVs", async () => {
      await fetch(`${baseUrl}/api/db/projects/${projectAId}/collections/secrets/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${projectAToken}` },
        body: JSON.stringify({ recordId: "rec_a2", data: { val: "test1" } })
      });
      await fetch(`${baseUrl}/api/db/projects/${projectAId}/collections/secrets/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${projectAToken}` },
        body: JSON.stringify({ recordId: "rec_a3", data: { val: "test1" } })
      });

      const raw2 = await (await fetch(`${baseUrl}/api/db/projects/${projectAId}/collections/secrets/records/rec_a2/raw`, { headers: { Authorization: `Bearer ${projectAToken}` } })).json();
      const raw3 = await (await fetch(`${baseUrl}/api/db/projects/${projectAId}/collections/secrets/records/rec_a3/raw`, { headers: { Authorization: `Bearer ${projectAToken}` } })).json();

      const env2 = JSON.parse(raw2.rawPersistedContent);
      const env3 = JSON.parse(raw3.rawPersistedContent);

      assert.notEqual(env2.iv, env3.iv, "Unique IV generated per record");
      assert.equal(env2.iv.length, 24, "IV is exactly 12 bytes (24 hex characters)");
    });

    console.log("\n[4. PATH TRAVERSAL & INJECTION RESISTANCE]");

    const traversalPayloads = [
      "../evil",
      "..\\evil",
      "%2e%2e%2fevil",
      "%252e%252e%252fevil",
      "/etc/passwd",
      "evil\0name",
      "../",
      "..",
      "col/subcol",
      "col\\subcol",
      "col/../secret",
      "col//secret"
    ];

    for (const malicious of traversalPayloads) {
      await runAuditTest(`Reject path traversal attempt in collection: ${malicious}`, async () => {
        const res = await fetch(`${baseUrl}/api/db/projects/${projectAId}/collections`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${projectAToken}` },
          body: JSON.stringify({ collection: malicious })
        });
        assert.ok(res.status === 400 || res.status === 403 || res.status === 404, `Rejected with status ${res.status}`);
      });
    }

    console.log("\n[5. CONCURRENCY & OPTIMISTIC LOCKING]");

    await runAuditTest("Updating with a stale SHA returns 409 Conflict", async () => {
      const getRes = await fetch(`${baseUrl}/api/db/projects/${projectAId}/collections/secrets/records/rec_a1`, {
        headers: { Authorization: `Bearer ${projectAToken}` }
      });
      const { sha: initialSha } = await getRes.json();

      // First update: should succeed
      const update1 = await fetch(`${baseUrl}/api/db/projects/${projectAId}/collections/secrets/records/rec_a1`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${projectAToken}` },
        body: JSON.stringify({ expectedSha: initialSha, data: { step: 1 } })
      });
      assert.equal(update1.status, 200, "First update succeeds with initial SHA");

      // Second update with initial (now stale) SHA: must return 409
      const update2 = await fetch(`${baseUrl}/api/db/projects/${projectAId}/collections/secrets/records/rec_a1`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${projectAToken}` },
        body: JSON.stringify({ expectedSha: initialSha, data: { step: 2 } })
      });
      assert.equal(update2.status, 409, "Stale SHA update returns 409 Conflict");
      const errJson = await update2.json();
      assert.equal(errJson.error, "Conflict");
    });

    console.log("\n[6. RATE LIMITING, PAYLOAD LIMITS & MALFORMED JSON]");

    await runAuditTest("Responses include standard rate limit headers", async () => {
      const res = await fetch(`${baseUrl}/api/health`);
      assert.ok(res.headers.get("x-ratelimit-limit"), "x-ratelimit-limit header exists");
      assert.ok(res.headers.get("x-ratelimit-remaining"), "x-ratelimit-remaining header exists");
      assert.ok(res.headers.get("x-ratelimit-reset"), "x-ratelimit-reset header exists");
    });

    await runAuditTest("Malformed JSON payload returns 400 Bad Request", async () => {
      const res = await fetch(`${baseUrl}/api/db/projects/${projectAId}/collections`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${projectAToken}` },
        body: "INVALID_JSON_PAYLOAD_NOT_AN_OBJECT"
      });
      assert.equal(res.status, 400, "Malformed JSON returns 400");
      const json = await res.json();
      assert.equal(json.error, "Bad Request");
    });

    console.log("\n[7. TOKEN ROTATION & REVOCATION LIFECYCLE]");

    await runAuditTest("Rotate project token invalidates old token and activates new token", async () => {
      const rotRes = await fetch(`${baseUrl}/api/db/projects/${projectAId}/token/rotate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${userSessionToken}` }
      });
      assert.equal(rotRes.status, 200, "Token rotation returns 200");
      const { projectToken: newProjectAToken } = await rotRes.json();
      assert.notEqual(newProjectAToken, projectAToken, "New token differs from old token");

      // Old token should now be rejected
      const oldTokenRes = await fetch(`${baseUrl}/api/db/projects/${projectAId}/collections`, {
        headers: { Authorization: `Bearer ${projectAToken}` }
      });
      assert.equal(oldTokenRes.status, 403, "Old token rejected with 403 after rotation");

      // New token should work
      const newTokenRes = await fetch(`${baseUrl}/api/db/projects/${projectAId}/collections`, {
        headers: { Authorization: `Bearer ${newProjectAToken}` }
      });
      assert.equal(newTokenRes.status, 200, "New token accepted after rotation");
      projectAToken = newProjectAToken;
    });

    await runAuditTest("Revoking project token disables project and blocks access", async () => {
      const revRes = await fetch(`${baseUrl}/api/db/projects/${projectAId}/token/revoke`, {
        method: "POST",
        headers: { Authorization: `Bearer ${userSessionToken}` }
      });
      assert.equal(revRes.status, 200, "Token revocation returns 200");

      const accessRes = await fetch(`${baseUrl}/api/db/projects/${projectAId}/collections`, {
        headers: { Authorization: `Bearer ${projectAToken}` }
      });
      assert.equal(accessRes.status, 403, "Access blocked after revocation");
    });

    console.log("\n[8. SDK INTEGRATION AUDIT]");

    await runAuditTest("EncryptedDatabaseClient completes end-to-end CRUD and pagination", async () => {
      const sdkProjId = `sdk_proj_${Date.now()}`;
      const pRes = await fetch(`${baseUrl}/api/db/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${userSessionToken}` },
        body: JSON.stringify({ projectId: sdkProjId })
      });
      const { projectToken: sdkToken } = await pRes.json();

      const client = new EncryptedDatabaseClient({
        baseUrl,
        projectId: sdkProjId,
        projectToken: sdkToken
      });

      const health = await client.checkHealth();
      assert.ok(health.status === "healthy" || health.status === "ok");

      await client.createCollection("users");
      const cols = await client.listCollections();
      assert.ok(cols.includes("users"));

      const ins = await client.insertRecord("users", { name: "Alice", role: "admin", level: 10 }, "alice");
      assert.equal(ins.recordId, "alice");

      const fetched = await client.getRecord("users", "alice");
      assert.equal(fetched.data.name, "Alice");
      assert.equal(fetched.data.role, "admin");

      const upd = await client.updateRecord("users", "alice", { name: "Alice", role: "lead", level: 12 });
      assert.equal(upd.recordId, "alice");

      const filtered = await client.listRecords("users", { role: "lead" });
      assert.equal(filtered.length, 1);
      assert.equal(filtered[0].data.name, "Alice");

      const paginated = await client.listRecordsPaginated("users", 1, 10);
      assert.equal(paginated.page, 1);
      assert.equal(paginated.total, 1);
      assert.equal(paginated.records.length, 1);

      const stats = await client.getStats();
      assert.equal(stats.projectId, sdkProjId);
      assert.ok(stats.totalRecords >= 1);

      const raw = await client.getRawEnvelope("users", "alice");
      assert.ok(raw.isEncrypted);
      assert.ok(raw.rawPersistedContent.includes("ciphertext"));

      const del = await client.deleteRecord("users", "alice");
      assert.equal(del.success, true);
    });

    console.log("\n[9. ERROR CONSISTENCY AUDIT]");

    await runAuditTest("Non-existent records return consistent JSON 404", async () => {
      const res = await fetch(`${baseUrl}/api/db/projects/${projectBId}/collections/unknown_col/records/non_existent`, {
        headers: { Authorization: `Bearer ${projectBToken}` }
      });
      assert.equal(res.status, 404);
      const json = await res.json();
      assert.equal(json.error, "Not Found");
      assert.ok(typeof json.message === "string");
    });

  } finally {
    server.close();
  }

  console.log("\n========================================================");
  console.log(`PHASE 4 AUDIT SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log("========================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Fatal audit execution error:", err);
  process.exit(1);
});
