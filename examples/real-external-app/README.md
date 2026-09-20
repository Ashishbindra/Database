# Real-World External Application

A completely standalone and independent example application demonstrating how an external third-party service integrates with **GitHub Encrypted Storage SDK** using strictly public client configuration.

---

## 🌟 Integration Overview

- **Package**: `github-encrypted-storage-sdk`
- **Zero Server Secrets**: No `GITHUB_STORAGE_PAT`, `SESSION_SECRET`, or master encryption keys required or exposed.
- **Client Configuration**:
  - `DATABASE_URL`: Public endpoint URL of the database server
  - `DATABASE_PROJECT_ID`: Target project namespace
  - `DATABASE_PROJECT_TOKEN`: HMAC-signed scoped project API token

---

## 🚀 Quick Setup & Execution

### 1. Environment Configuration

```bash
export DATABASE_URL="https://github-encrypted-vault.vercel.app"
export DATABASE_PROJECT_ID="my-fintech-project"
export DATABASE_PROJECT_TOKEN="pt_live_xxxxxxxxxxxxxxxxxxxxxxxx"
```

### 2. Run Application

```bash
npm start
```

### 3. Run Automated Integration Test

```bash
npm test
```

---

## 📝 Code Sample

```typescript
import { EncryptedDatabaseClient } from "github-encrypted-storage-sdk";

// Initialize client
const db = new EncryptedDatabaseClient({
  baseUrl: process.env.DATABASE_URL!,
  projectId: process.env.DATABASE_PROJECT_ID!,
  projectToken: process.env.DATABASE_PROJECT_TOKEN!,
});

// Check health
const health = await db.checkHealth();

// Create collection
await db.createCollection("audit_logs");

// Insert encrypted record
const insertResult = await db.insertRecord("audit_logs", {
  eventType: "PAYMENT_PROCESSED",
  amount: 50000,
  currency: "USD",
}, "evt_001");

// Read decrypted record
const record = await db.getRecord("audit_logs", "evt_001");

// Filter records
const critical = await db.listRecords("audit_logs", {
  filterField: "severity",
  filterValue: "CRITICAL",
});

// Paginate records
const page1 = await db.listRecordsPaginated("audit_logs", { page: 1, limit: 10 });

// Update with optimistic concurrency
const updated = await db.updateRecord(
  "audit_logs",
  "evt_001",
  { ...record.data, status: "settled" },
  record.sha
);

// Inspect zero-knowledge remote ciphertext envelope
const rawEnvelope = await db.getRawEnvelope("audit_logs", "evt_001");

// Get project stats
const stats = await db.getStats();

// Delete record
await db.deleteRecord("audit_logs", "evt_001", updated.sha);
```
