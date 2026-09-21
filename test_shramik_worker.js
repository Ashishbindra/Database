import { CentralDataClient } from "./src/sdk/CentralDataClient.js";
import { CryptoManager } from "./src/sdk/crypto/CryptoManager.js";

async function runWorkerVerification() {
  console.log("=== STARTING WORKER SHR-000001 VERIFICATION ===");
  const client = new CentralDataClient("http://localhost:3000");

  const username = "contractor_" + Date.now();
  const password = "OwnerSecurePassword123!";

  console.log(`1. Registering Owner: ${username}`);
  const regResult = await client.authManager.register(username, password);
  console.log("Owner Registered Successfully. User ID:", regResult.profile.userId);

  console.log("2. Creating Worker SHR-000001 with Worker Login Enabled...");
  const workerPassword = "WorkerPassword987!";
  const workerSaltBytes = CryptoManager.getRandomBytes(32);
  const workerSaltHex = CryptoManager.bytesToHex(workerSaltBytes);
  const workerPasswordHash = await CryptoManager.deriveAuthProofHash(workerPassword, workerSaltHex);

  const workerRecord = {
    id: "SHR-000001",
    name: "Ramesh Builder",
    skill: "Mason / Karigar",
    dailyWage: 800,
    phone: "9876543210",
    isWorkerLoginEnabled: true,
    workerPasswordHash,
    workerSaltHex,
    updatedAt: Date.now()
  };

  // Build state map and sync
  const stateMap = new Map();
  stateMap.set("worker_SHR-000001", {
    id: "worker_SHR-000001",
    entity: "workers",
    data: workerRecord,
    updatedAt: Date.now()
  });

  console.log("3. Syncing Owner State & Worker Auth Entries to Backend...");
  await client.syncManager.syncState(stateMap, "shramik_hisab");
  console.log("Sync completed successfully.");

  console.log("4. Testing POST /api/vault/worker/auth-params for SHR-000001...");
  const authParams = await client.workerAuthClient.getWorkerAuthParams("SHR-000001");
  console.log("Auth Params Result:", authParams);

  if (!authParams.exists || !authParams.isWorkerLoginEnabled) {
    throw new Error("Verification failed: worker SHR-000001 not found or login not enabled in global index.");
  }

  console.log("5. Testing POST /api/vault/worker/login for SHR-000001...");
  const loginProof = await CryptoManager.deriveAuthProofHash(workerPassword, authParams.workerSaltHex);
  const loginResult = await client.workerAuthClient.workerLogin("SHR-000001", loginProof);
  console.log("Worker Login Result:", {
    success: loginResult.success,
    authenticatedWorkerId: loginResult.authenticatedWorkerId,
    opaqueUserId: loginResult.opaqueUserId,
    appId: loginResult.appId
  });

  if (!loginResult.success || loginResult.authenticatedWorkerId !== "SHR-000001") {
    throw new Error("Verification failed: worker login did not authenticate successfully.");
  }

  console.log("=== WORKER SHR-000001 VERIFICATION PASSED SUCCESSFULLY ===");
}

runWorkerVerification().catch((err) => {
  console.error("VERIFICATION FAILED:", err);
  process.exit(1);
});
