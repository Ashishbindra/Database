import crypto from "crypto";

async function runApiVerification() {
  console.log("=== API WORKER SHR-000001 VERIFICATION START ===");
  const baseUrl = "http://localhost:3000";

  // 1. Register Owner
  const username = "shramik_owner_" + Date.now();
  const password = "OwnerPassword123!";
  const saltHex = crypto.randomBytes(32).toString("hex");
  const authProofHash = crypto.createHash("sha256").update(password + saltHex).digest("hex");
  const opaqueUserId = "u_" + crypto.createHash("sha256").update(username).digest("hex").substring(0, 16);
  const wrappedDek = { ciphertext: "mock", iv: "mock", salt: "mock" };
  const recoveryWrappedDek = { ciphertext: "mock", iv: "mock", salt: "mock" };

  console.log(`Registering owner: ${username}`);
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
  console.log("Register response status:", regRes.status, regData);
  if (!regRes.ok) throw new Error("Registration failed");

  const sessionToken = regData.sessionToken;

  // 2. Prepare Worker SHR-000001 credentials
  const workerPassword = "WorkerPasswordSHR1!";
  const workerSaltHex = crypto.randomBytes(32).toString("hex");
  // Match server derivation: crypto.createHash("sha256").update(password + "_auth_secret_v2" + saltHex).digest("hex")
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
      }
    }
  };

  console.log("Syncing owner state & worker auth entries for SHR-000001...");
  const syncRes = await fetch(`${baseUrl}/api/vault/sync`, {
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

  const syncData = await syncRes.json();
  console.log("Sync response status:", syncRes.status, syncData);
  if (!syncRes.ok) throw new Error("Sync failed");

  // 3. Test POST /api/vault/worker/auth-params
  console.log("Testing POST /api/vault/worker/auth-params for SHR-000001...");
  const authParamsRes = await fetch(`${baseUrl}/api/vault/worker/auth-params`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workerId: "SHR-000001" })
  });

  const authParamsData = await authParamsRes.json();
  console.log("POST /api/vault/worker/auth-params Response:", authParamsData);

  if (!authParamsData.exists || !authParamsData.isWorkerLoginEnabled) {
    throw new Error("auth-params did not find SHR-000001 with login enabled");
  }

  // 4. Test POST /api/vault/worker/login
  console.log("Testing POST /api/vault/worker/login for SHR-000001...");
  // Client derives login proof hash: crypto.createHash("sha256").update(password + "_auth_secret_v2" + saltHex).digest("hex")
  const loginProofHash = crypto.createHash("sha256").update(workerPassword + "_auth_secret_v2" + authParamsData.workerSaltHex).digest("hex");

  const loginRes = await fetch(`${baseUrl}/api/vault/worker/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workerId: "SHR-000001",
      passwordHash: loginProofHash
    })
  });

  const loginData = await loginRes.json();
  console.log("POST /api/vault/worker/login Response:", {
    status: loginRes.status,
    success: loginData.success,
    authenticatedWorkerId: loginData.authenticatedWorkerId,
    opaqueUserId: loginData.opaqueUserId,
    appId: loginData.appId
  });

  if (!loginRes.ok || !loginData.success) {
    throw new Error("Worker login authentication failed");
  }

  console.log("=== ALL SHR-000001 WORKER VERIFICATION TESTS PASSED SUCCESSFULLY ===");
}

runApiVerification().catch((err) => {
  console.error("VERIFICATION TEST ERROR:", err.message);
  process.exit(1);
});
