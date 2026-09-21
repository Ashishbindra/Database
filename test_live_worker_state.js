import crypto from "crypto";

async function testLiveWorkerStateEndpoint() {
  console.log("=== TESTING LIVE PRODUCTION /api/vault/worker/state ===");
  const baseUrl = "http://localhost:3000";

  // 1. Register Owner
  const username = "live_owner_" + Date.now();
  const password = "OwnerPassword123!";
  const saltHex = crypto.randomBytes(32).toString("hex");
  const authProofHash = crypto.createHash("sha256").update(password + saltHex).digest("hex");
  const opaqueUserId = "u_" + crypto.createHash("sha256").update(username).digest("hex").substring(0, 16);
  const wrappedDek = { ciphertext: "mock", iv: "mock", salt: "mock" };
  const recoveryWrappedDek = { ciphertext: "mock", iv: "mock", salt: "mock" };

  const regRes = await fetch(`${baseUrl}/api/vault/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      opaqueUserId,
      saltHex,
      authProofHash,
      wrappedDek,
      recoveryWrappedDek
    })
  });
  const regData = await regRes.json();
  const sessionToken = regData.sessionToken;

  // 2. Prepare Worker SHR-000001 credentials
  const workerPassword = "WorkerPasswordSHR1!";
  const workerSaltHex = crypto.randomBytes(32).toString("hex");
  const workerPasswordHash = crypto.createHash("sha256").update(workerPassword + "_auth_secret_v2" + workerSaltHex).digest("hex");

  const workerAuthEntries = [{
    workerId: "SHR-000001",
    isWorkerLoginEnabled: true,
    workerPasswordHash,
    workerSaltHex
  }];

  const stateObject = {
    version: 1,
    records: {
      "worker_SHR-000001": {
        id: "SHR-000001",
        entity: "workers",
        data: {
          id: "SHR-000001",
          name: "Ramesh Laborer",
          isWorkerLoginEnabled: true,
          workerPasswordHash,
          workerSaltHex
        }
      },
      "attendance_1": {
        id: "attendance_1",
        entity: "attendance",
        data: {
          workerId: "SHR-000001",
          status: "PRESENT",
          date: "2026-09-21"
        }
      }
    }
  };

  // 3. Owner Syncs state & worker auth entries
  await fetch(`${baseUrl}/api/vault/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${sessionToken}`
    },
    body: JSON.stringify({
      appId: "shramik_hisab",
      stateObject,
      workerAuthEntries
    })
  });

  // 4. Fetch auth params for SHR-000001
  const authParamsRes = await fetch(`${baseUrl}/api/vault/worker/auth-params`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workerId: "SHR-000001" })
  });
  const authParamsData = await authParamsRes.json();

  // 5. Derive passwordHash / passwordProof for worker login / state request
  const loginProofHash = crypto.createHash("sha256").update(workerPassword + "_auth_secret_v2" + authParamsData.workerSaltHex).digest("hex");

  // Exact request format used by Android client / SDK
  const requestPayload = {
    workerId: "SHR-000001",
    passwordHash: loginProofHash,
    appId: "shramik_hisab"
  };

  // Redacted log output for display
  const redactedPayload = {
    ...requestPayload,
    passwordHash: "[REDACTED_PASSWORD_HASH]"
  };

  console.log("--- REQUEST ---");
  console.log("POST /api/vault/worker/state");
  console.log("Headers: { Content-Type: application/json }");
  console.log("Body:", JSON.stringify(redactedPayload, null, 2));

  // 6. Test LIVE POST /api/vault/worker/state
  const stateRes = await fetch(`${baseUrl}/api/vault/worker/state`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestPayload)
  });

  const httpStatus = stateRes.status;
  const stateData = await stateRes.json();

  const recordsCount = stateData.state?.records ? Object.keys(stateData.state.records).length : 0;

  console.log("\n--- RESPONSE ---");
  console.log("HTTP Status:", httpStatus);
  console.log("exists:", stateData.exists);
  console.log("recordsCount:", recordsCount);
  console.log("opaqueUserId:", stateData.opaqueUserId);
  console.log("Full Response JSON:", JSON.stringify(stateData, null, 2));

  if (httpStatus === 200 && stateData.exists === true) {
    console.log("\n=== LIVE WORKER STATE ENDPOINT VERIFIED SUCCESSFULLY ===");
  } else {
    throw new Error("Live worker state verification failed");
  }
}

testLiveWorkerStateEndpoint().catch((err) => {
  console.error("TEST FAILED:", err.message);
  process.exit(1);
});
