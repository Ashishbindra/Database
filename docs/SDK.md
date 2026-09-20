# Encrypted Database Client SDK

Lightweight, HTTP-only client SDK for interacting with the GitHub-backed Encrypted Database API.

The SDK operates exclusively over HTTPS REST endpoints and never imports or handles server-side secrets (such as `GITHUB_STORAGE_PAT` or `SESSION_SECRET`).

---

## 📦 Installation

```bash
npm install github-encrypted-storage-sdk
```

---

## 🚀 Quick Start

### TypeScript / ES Modules

```typescript
import { EncryptedDatabaseClient } from "github-encrypted-storage-sdk";

// Initialize client with project token
const db = new EncryptedDatabaseClient({
  baseUrl: "https://github-encrypted-vault.vercel.app", // or your custom domain / localhost:3000
  projectId: "my-app",
  projectToken: "pt_live_9a8b7c6d5e4f3a2b1c0d",
});

async function run() {
  // 1. Health check
  const isHealthy = await db.checkHealth();
  console.log("Database online:", isHealthy);

  // 2. Create / ensure collection
  await db.createCollection("users");

  // 3. Create an encrypted record
  const result = await db.createRecord("users", {
    name: "Alice Johnson",
    email: "alice@example.com",
    role: "admin",
    active: true,
  });
  console.log("Created Record ID:", result.recordId, "Git Blob SHA:", result.sha);

  // 4. Read decrypted record
  const record = await db.getRecord("users", result.recordId);
  console.log("Decrypted Data:", record.data);

  // 5. Update record with optimistic concurrency (SHA validation)
  const updated = await db.updateRecord(
    "users",
    result.recordId,
    {
      ...record.data,
      role: "lead-architect",
    },
    record.sha // Prevents race conditions
  );
  console.log("Updated Record SHA:", updated.sha);

  // 6. Query / Filter records
  const admins = await db.listRecords("users", { role: "lead-architect" });
  console.log("Found admins:", admins.length);

  // 7. Paginate records
  const page = await db.listRecordsPaginated("users", 1, 10);
  console.log(`Page ${page.page} of ${page.totalPages} (Total records: ${page.total})`);

  // 8. Delete record
  await db.deleteRecord("users", result.recordId, updated.sha);
  console.log("Record deleted successfully");
}

run().catch(console.error);
```

### JavaScript / CommonJS

```javascript
const { EncryptedDatabaseClient } = require("github-encrypted-storage-sdk");

const db = new EncryptedDatabaseClient({
  baseUrl: "https://github-encrypted-vault.vercel.app",
  projectId: "ecommerce-prod",
  projectToken: process.env.PROJECT_API_TOKEN,
});

async function main() {
  const item = await db.createRecord("inventory", {
    sku: "SKU-9941",
    price: 49.99,
    stock: 120,
  });
  console.log("Inventory item saved:", item.recordId);
}

main().catch(console.error);
```

---

## 🛠️ API Reference

### `new EncryptedDatabaseClient(config)`

| Option | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `baseUrl` | `string` | **Yes** | Root API origin (e.g. `https://your-domain.com`) |
| `projectId` | `string` | Optional | Active project ID for collection/record operations |
| `projectToken` | `string` | Optional | Cryptographically signed HMAC Project API Token |
| `userSessionToken` | `string` | Optional | User administrative session token (for project creation) |
| `fetchFn` | `typeof fetch` | Optional | Custom `fetch` implementation for edge/testing environments |

---

### Project Management

#### `db.createProject(projectId)`
Creates a new isolated project namespace and derives its HMAC token.
- **Returns**: `Promise<{ success: boolean; projectId: string; projectToken: string }>`

#### `db.listProjects()`
Lists all projects belonging to the authenticated user.
- **Returns**: `Promise<ProjectItem[]>`

#### `db.rotateProjectToken(projectId)`
Rotates the HMAC signing token for a project, invalidating prior tokens.
- **Returns**: `Promise<{ success: boolean; projectId: string; projectToken: string }>`

#### `db.revokeProjectToken(projectId)`
Disables the project and revokes token access.
- **Returns**: `Promise<{ success: boolean; projectId: string; status: "disabled" }>`

---

### Collection Operations

#### `db.listCollections()`
Returns an array of existing collection names for the current project.
- **Returns**: `Promise<string[]>`

#### `db.createCollection(collectionName)`
Explicitly initializes a collection directory.
- **Returns**: `Promise<{ success: boolean; collection: string }>`

---

### Record CRUD & Querying

#### `db.createRecord(collection, data, [recordId])` / `db.insertRecord(...)`
Encrypts payload with AES-256-GCM and persists to GitHub.
- **Returns**: `Promise<{ success: boolean; recordId: string; sha: string; message: string }>`

#### `db.getRecord(collection, recordId)`
Retrieves and decrypts the record.
- **Returns**: `Promise<RecordEnvelope<T>>` (`{ recordId, data: T, sha, updatedAt }`)

#### `db.getRawEnvelope(collection, recordId)`
Retrieves the raw un-decrypted ciphertext envelope for zero-knowledge validation.
- **Returns**: `Promise<RawRecordEnvelope>`

#### `db.updateRecord(collection, recordId, data, [sha])`
Updates an existing record. If `sha` is provided, enforces optimistic concurrency control.
- **Returns**: `Promise<{ success: boolean; recordId: string; sha: string }>`

#### `db.deleteRecord(collection, recordId, [sha])`
Deletes a record from storage.
- **Returns**: `Promise<{ success: boolean; recordId: string }>`

#### `db.listRecords(collection, [filters])`
Fetches and decrypts all records, optionally filtering by exact field match.
- **Returns**: `Promise<RecordEnvelope<T>[]>`

#### `db.listRecordsPaginated(collection, [page=1], [limit=20], [filters])`
Returns paginated list of decrypted records with total count and metadata.
- **Returns**: `Promise<PaginatedRecordsResult<T>>`

---

### Diagnostics & Stats

#### `db.checkHealth()`
Returns `true` if server `/api/health` responds with HTTP 200.

#### `db.getStats()`
Fetches aggregate project statistics (collection counts, storage volume).

#### `db.getUsageTelemetry()`
Fetches active request metrics and rate limit usage.

---

## 🔒 Error Handling

The SDK throws `DatabaseApiError` on HTTP failures (e.g. 401, 403, 404, 409, 429).

```typescript
import { EncryptedDatabaseClient, DatabaseApiError } from "github-encrypted-storage-sdk";

try {
  await db.updateRecord("users", "user_1", { active: false }, "outdated_sha_123");
} catch (err) {
  if (err instanceof DatabaseApiError) {
    console.error(`Status: ${err.status}`);       // e.g. 409
    console.error(`Code: ${err.code}`);           // e.g. "CONCURRENCY_CONFLICT"
    console.error(`Message: ${err.message}`);     // Safe readable message
  }
}
```

---

## 🛡️ Security Architecture

1. **Client Isolation**: The SDK is pure HTTP and contains zero server credentials.
2. **Project Boundaries**: Project tokens are validated with HMAC-SHA256. Project A cannot access Project B data.
3. **AES-256-GCM Encryption**: Payloads are encrypted at the server layer before GitHub commit. GitHub only ever sees authenticated ciphertext.
4. **Optimistic Concurrency**: Stale updates are rejected via Git blob SHA verification to prevent write stomping.
