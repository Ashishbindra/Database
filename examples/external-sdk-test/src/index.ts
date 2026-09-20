/**
 * External Application Integration Example
 *
 * Demonstrates how an external third-party application integrates with the
 * GitHub-backed Encrypted Database Service using only public configuration:
 *   - DATABASE_URL
 *   - DATABASE_PROJECT_ID
 *   - DATABASE_PROJECT_TOKEN
 *
 * Zero server secrets (such as GITHUB_STORAGE_PAT or master encryption keys)
 * are required, imported, or exposed.
 */

import { EncryptedDatabaseClient, DatabaseApiError } from "github-encrypted-storage-sdk";

// External application credentials supplied via environment variables
const DATABASE_URL = process.env.DATABASE_URL || "http://localhost:3000";
const DATABASE_PROJECT_ID = process.env.DATABASE_PROJECT_ID || "external-demo-app";
const DATABASE_PROJECT_TOKEN = process.env.DATABASE_PROJECT_TOKEN || "";

interface CustomerRecord {
  name: string;
  email: string;
  tier: "standard" | "enterprise";
  createdTimestamp: string;
}

export async function runExternalIntegrationDemo() {
  console.log("==================================================");
  console.log("🚀 EXTERNAL APP INTEGRATION DEMO");
  console.log(`Connecting to: ${DATABASE_URL}`);
  console.log(`Project ID:    ${DATABASE_PROJECT_ID}`);
  console.log("==================================================");

  // 1. Initialize Client SDK
  const client = new EncryptedDatabaseClient({
    baseUrl: DATABASE_URL,
    projectId: DATABASE_PROJECT_ID,
    projectToken: DATABASE_PROJECT_TOKEN,
  });

  // 2. Health & Status Check
  console.log("\n[1/7] Checking Database Service Health...");
  const health = await client.checkHealth();
  console.log(`✓ Service Health Status: ${health.status}`);

  if (!DATABASE_PROJECT_TOKEN) {
    console.log("⚠️ No DATABASE_PROJECT_TOKEN provided. Run with valid credentials or execute the automated test runner.");
    return;
  }

  // 3. Collection Management
  console.log("\n[2/7] Ensuring Collection 'customers'...");
  await client.createCollection("customers");
  const collections = await client.listCollections();
  console.log(`✓ Active Collections: [${collections.join(", ")}]`);

  // 4. Encrypted Record Insertion
  console.log("\n[3/7] Inserting Encrypted Customer Record...");
  const customerData: CustomerRecord = {
    name: "Jane Smith",
    email: "jane.smith@enterprise.org",
    tier: "enterprise",
    createdTimestamp: new Date().toISOString(),
  };

  const insertResult = await client.createRecord("customers", customerData, "cust_jane_101");
  console.log(`✓ Record Created ID: ${insertResult.recordId}`);
  console.log(`✓ Git Blob SHA:      ${insertResult.sha}`);

  // 5. Read & Verify Transparent Decryption
  console.log("\n[4/7] Retrieving Decrypted Record...");
  const retrieved = await client.getRecord<CustomerRecord>("customers", "cust_jane_101");
  console.log(`✓ Customer Name:  ${retrieved.data.name}`);
  console.log(`✓ Customer Email: ${retrieved.data.email}`);
  console.log(`✓ Customer Tier:  ${retrieved.data.tier}`);

  // 6. Inspect Raw Ciphertext Envelope on Remote Storage
  console.log("\n[5/7] Inspecting Remote Encrypted Envelope (Zero-Knowledge Proof)...");
  const rawEnvelope = await client.getRawEnvelope("customers", "cust_jane_101");
  console.log(`✓ isEncrypted: ${rawEnvelope.isEncrypted}`);
  console.log(`✓ Persisted Ciphertext Preview: ${rawEnvelope.rawPersistedContent.slice(0, 75)}...`);

  // 7. Optimistic Concurrency Update
  console.log("\n[6/7] Updating Record with Optimistic Concurrency SHA Check...");
  const updateResult = await client.updateRecord(
    "customers",
    "cust_jane_101",
    {
      ...retrieved.data,
      tier: "enterprise",
      updatedAt: new Date().toISOString(),
    },
    retrieved.sha // Ensures no concurrent collision
  );
  console.log(`✓ Record Updated. New Git Blob SHA: ${updateResult.sha}`);

  // 8. Project Telemetry & Statistics
  console.log("\n[7/7] Fetching Project Stats...");
  const stats = await client.getStats();
  console.log(`✓ Total Collections: ${stats.collectionsCount}`);
  console.log(`✓ Total Records:     ${stats.totalRecords}`);

  console.log("\n==================================================");
  console.log("🎉 External App Integration Demo Completed Successfully!");
  console.log("==================================================");
}

// Auto-run if executed directly
if (process.argv[1] && process.argv[1].endsWith("src/index.ts")) {
  runExternalIntegrationDemo().catch((err) => {
    if (err instanceof DatabaseApiError) {
      console.error(`❌ DatabaseApiError (${err.statusCode}): ${err.message}`);
    } else {
      console.error("❌ Unexpected Error:", err);
    }
    process.exit(1);
  });
}
