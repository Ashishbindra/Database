/**
 * Real-World External Application
 *
 * This completely independent application integrates with the GitHub Encrypted Vault
 * using the published `github-encrypted-storage-sdk` package.
 *
 * It uses strictly public client environment variables:
 *   - DATABASE_URL
 *   - DATABASE_PROJECT_ID
 *   - DATABASE_PROJECT_TOKEN
 *
 * No server secrets (e.g., GITHUB_STORAGE_PAT, SESSION_SECRET) or internal server
 * files are imported or required.
 */

import { EncryptedDatabaseClient, DatabaseApiError } from "github-encrypted-storage-sdk";

// 1. Configure from environment variables
const DATABASE_URL = process.env.DATABASE_URL || "http://localhost:3000";
const DATABASE_PROJECT_ID = process.env.DATABASE_PROJECT_ID || "real-fintech-app";
const DATABASE_PROJECT_TOKEN = process.env.DATABASE_PROJECT_TOKEN || "";

export interface AuditEventRecord {
  eventId: string;
  eventType: "PAYMENT_PROCESSED" | "KEY_ROTATION" | "USER_LOGIN" | "ACCESS_GRANT";
  severity: "INFO" | "WARNING" | "CRITICAL";
  actorEmail: string;
  amount?: number;
  currency?: string;
  metadata: Record<string, any>;
  timestamp: string;
}

export async function runRealExternalApp() {
  console.log("==================================================");
  console.log("🚀 REAL-WORLD EXTERNAL APPLICATION RUNNER");
  console.log(`📡 Database URL: ${DATABASE_URL}`);
  console.log(`📁 Project ID:   ${DATABASE_PROJECT_ID}`);
  console.log("==================================================");

  // Step 1: SDK Initialization
  const db = new EncryptedDatabaseClient({
    baseUrl: DATABASE_URL,
    projectId: DATABASE_PROJECT_ID,
    projectToken: DATABASE_PROJECT_TOKEN,
  });

  // Step 2: Service Health Check
  console.log("\n[1/10] Checking Service Health...");
  const health = await db.checkHealth();
  console.log(`✓ Service Health Status: ${health.status} (Uptime: ${health.uptime ?? "n/a"}s)`);

  if (!DATABASE_PROJECT_TOKEN) {
    console.log("⚠️ No DATABASE_PROJECT_TOKEN provided. Run via test runner or provide a valid project token.");
    return;
  }

  // Step 3: Collection Management
  console.log("\n[2/10] Ensuring Collection 'audit_logs' exists...");
  await db.createCollection("audit_logs");
  const collections = await db.listCollections();
  console.log(`✓ Available Collections: [${collections.join(", ")}]`);

  // Step 4: Encrypted Record Insertion (Transparent AES-256-GCM)
  console.log("\n[3/10] Inserting Encrypted Records...");
  const event1: AuditEventRecord = {
    eventId: "evt_001",
    eventType: "PAYMENT_PROCESSED",
    severity: "INFO",
    actorEmail: "sarah.billing@company.com",
    amount: 12500.0,
    currency: "USD",
    metadata: { paymentMethod: "ACH_WIRE", clearance: "VERIFIED" },
    timestamp: new Date().toISOString(),
  };

  const event2: AuditEventRecord = {
    eventId: "evt_002",
    eventType: "ACCESS_GRANT",
    severity: "CRITICAL",
    actorEmail: "admin.sec@company.com",
    metadata: { resource: "PRODUCTION_SECRETS_VAULT", action: "GRANT_TEMPORARY" },
    timestamp: new Date().toISOString(),
  };

  const res1 = await db.insertRecord("audit_logs", event1, "evt_001");
  const res2 = await db.insertRecord("audit_logs", event2, "evt_002");
  console.log(`✓ Inserted Record evt_001 (Git SHA: ${res1.sha})`);
  console.log(`✓ Inserted Record evt_002 (Git SHA: ${res2.sha})`);

  // Step 5: Read Decrypted Record
  console.log("\n[4/10] Reading & Transparently Decrypting Record evt_001...");
  const fetched = await db.getRecord<AuditEventRecord>("audit_logs", "evt_001");
  console.log(`✓ Decrypted Event Type: ${fetched.data.eventType}`);
  console.log(`✓ Decrypted Actor:      ${fetched.data.actorEmail}`);
  console.log(`✓ Decrypted Amount:     ${fetched.data.amount} ${fetched.data.currency}`);

  // Step 6: Server-Side Filtering
  console.log("\n[5/10] Querying Records with Server-Side Filter (severity = 'CRITICAL')...");
  const filtered = await db.listRecords<AuditEventRecord>("audit_logs", {
    filterField: "severity",
    filterValue: "CRITICAL",
  });
  console.log(`✓ Filter returned ${filtered.length} critical record(s)`);
  if (filtered.length > 0) {
    console.log(`  - Found: ${filtered[0].data.eventId} (${filtered[0].data.actorEmail})`);
  }

  // Step 7: Paginated Query
  console.log("\n[6/10] Querying Records with Pagination (Page 1, Limit 1)...");
  const paginated = await db.listRecordsPaginated<AuditEventRecord>("audit_logs", {
    page: 1,
    limit: 1,
  });
  console.log(`✓ Paginated results: Page ${paginated.page} of ${paginated.totalPages} (Total records: ${paginated.total})`);

  // Step 8: Zero-Knowledge Raw Envelope Inspection
  console.log("\n[7/10] Inspecting Remote Raw Encrypted Envelope...");
  const rawEnvelope = await db.getRawEnvelope("audit_logs", "evt_001");
  console.log(`✓ Is Encrypted: ${rawEnvelope.isEncrypted}`);
  console.log(`✓ Ciphertext Preview: ${rawEnvelope.rawPersistedContent.slice(0, 80)}...`);

  // Step 9: Optimistic Concurrency Update
  console.log("\n[8/10] Updating Record with Optimistic Concurrency SHA Check...");
  const updatedEvent: AuditEventRecord = {
    ...fetched.data,
    metadata: { ...fetched.data.metadata, reconciled: true, reconciledAt: new Date().toISOString() },
  };
  const updateRes = await db.updateRecord("audit_logs", "evt_001", updatedEvent, fetched.sha);
  console.log(`✓ Record Updated Successfully (New SHA: ${updateRes.sha})`);

  // Step 10: Project Stats & Telemetry
  console.log("\n[9/10] Fetching Project Telemetry Stats...");
  const stats = await db.getStats();
  console.log(`✓ Active Collections: ${stats.collectionsCount}`);
  console.log(`✓ Total Encrypted Records: ${stats.totalRecords}`);

  // Step 11: Record Deletion
  console.log("\n[10/10] Deleting Test Records...");
  await db.deleteRecord("audit_logs", "evt_001", updateRes.sha);
  await db.deleteRecord("audit_logs", "evt_002", res2.sha);
  console.log("✓ Records deleted cleanly.");

  console.log("\n==================================================");
  console.log("🎉 REAL-WORLD EXTERNAL APPLICATION RUN COMPLETED!");
  console.log("==================================================");
}

// Auto-run when executed directly via tsx
if (process.argv[1] && process.argv[1].endsWith("src/index.ts")) {
  runRealExternalApp().catch((err) => {
    if (err instanceof DatabaseApiError) {
      console.error(`❌ Database API Error (${err.statusCode}): ${err.message}`);
    } else {
      console.error("❌ Execution Failed:", err);
    }
    process.exit(1);
  });
}
