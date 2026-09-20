# External SDK Test Application

A clean, standalone example application demonstrating how an external application consumes the **`github-encrypted-storage-sdk`** package over HTTP/HTTPS REST endpoints.

---

## 🌟 Overview

This test application illustrates:
- Consuming the built npm client package (`github-encrypted-storage-sdk`)
- Configuring credentials strictly via environment variables
- Managing collection namespaces and encrypted records
- Transparent AES-256-GCM encryption & decryption
- Optimistic concurrency control via Git blob SHAs (`expectedSha`)
- Inspecting raw zero-knowledge ciphertext envelopes on remote storage
- Zero exposure of server secrets (`GITHUB_STORAGE_PAT`, `SESSION_SECRET`, etc.)

---

## 🚀 5-Minute Quick Start

### 1. Install the SDK

```bash
npm install github-encrypted-storage-sdk
```

### 2. Configure Environment Variables

Create a `.env` file or export the variables in your environment:

```env
DATABASE_URL=https://github-encrypted-vault.vercel.app
DATABASE_PROJECT_ID=my-project-id
DATABASE_PROJECT_TOKEN=pt_live_xxxxxxxxxxxxxxxxxxxxxxxx
```

> **Note:** Never commit production tokens or API keys to version control.

### 3. Initialize Client and Perform CRUD

```typescript
import { EncryptedDatabaseClient } from "github-encrypted-storage-sdk";

// 1. Initialize client
const db = new EncryptedDatabaseClient({
  baseUrl: process.env.DATABASE_URL || "https://github-encrypted-vault.vercel.app",
  projectId: process.env.DATABASE_PROJECT_ID!,
  projectToken: process.env.DATABASE_PROJECT_TOKEN!,
});

// 2. Health check
const health = await db.checkHealth();
console.log("Database status:", health.status);

// 3. Ensure collection exists
await db.createCollection("users");

// 4. Insert encrypted record
const insertResult = await db.createRecord("users", {
  name: "Sarah Connor",
  role: "Operator",
  email: "sarah@resistance.net",
}, "user_sarah_01");

console.log("Record ID:", insertResult.recordId);
console.log("Git Blob SHA:", insertResult.sha);

// 5. Read decrypted record
const record = await db.getRecord("users", "user_sarah_01");
console.log("Decrypted Data:", record.data);

// 6. Update with optimistic concurrency
const updated = await db.updateRecord(
  "users",
  "user_sarah_01",
  { ...record.data, role: "Commander" },
  record.sha // Prevents race conditions
);
console.log("Updated SHA:", updated.sha);

// 7. Inspect remote raw ciphertext envelope
const raw = await db.getRawEnvelope("users", "user_sarah_01");
console.log("Encrypted Ciphertext:", raw.rawPersistedContent);

// 8. Delete record
await db.deleteRecord("users", "user_sarah_01", updated.sha);
console.log("Record deleted cleanly.");
```

---

## 🧪 Running the Automated Test Suite

From this directory, run:

```bash
node scripts/run-test.mjs
```

Or from the root repository:

```bash
npm run test:phase6
```
