# Database Demo Application

A clean, standalone web application demonstrating how an external client application securely interacts with the production **Encrypted Multi-Project Database Service** (`https://github-encrypted-vault.vercel.app`) using the public **EncryptedDatabaseClient SDK** and HTTP REST endpoints.

---

## 1. How It Connects to the Production Database

This application does **not** import any server-side files, does **not** communicate with GitHub directly, and holds **no server master secrets**.

Instead, it interacts exclusively over standard HTTPS with the production REST API:

```
[Demo Client App] 
       │
       ▼ (HTTPS REST / JSON)
[Production Database API (https://github-encrypted-vault.vercel.app)]
       │
       ▼ (Server-Side Encryption & Storage)
[Encrypted GitHub Storage Repository]
```

### Endpoints Used:
- `GET /api/health` — Service readiness & status check
- `POST /api/db/projects` — Creates a project namespace and issues a signed Project API Token
- `GET /api/db/projects/:projectId/collections` — Lists collection namespaces
- `POST /api/db/projects/:projectId/collections` — Creates a collection namespace
- `POST /api/db/projects/:projectId/collections/:collection/records` — Inserts encrypted records
- `GET /api/db/projects/:projectId/collections/:collection/records/:id` — Decrypts & retrieves a single record
- `PUT /api/db/projects/:projectId/collections/:collection/records/:id` — Updates a record with optimistic concurrency (`expectedSha`)
- `DELETE /api/db/projects/:projectId/collections/:collection/records/:id` — Deletes a record
- `GET /api/db/projects/:projectId/collections/:collection/records?filterField=name&filterValue=...` — Lists and filters records

---

## 2. Authentication Model

The architecture utilizes a **two-tier token hierarchy**:

1. **User Session Token (`Bearer <userSessionToken>`)**:
   - Used only for administrative provisioning: creating new projects (`POST /api/db/projects`) and listing owned projects (`GET /api/db/projects`).
   - Obtained via user login or registration (`/api/vault/login` or `/api/vault/register`).

2. **Project API Token (`Bearer <projectToken>`)**:
   - Scoped strictly to a single project namespace.
   - Contains a cryptographic HMAC signature preventing cross-project tampering.
   - Used for all day-to-day CRUD operations on collections and records.

---

## 3. How to Configure

### Prerequisites
- Node.js 18+ and npm / bun

### Quick Start
1. Navigate into the demo directory:
   ```bash
   cd examples/database-demo
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run development server:
   ```bash
   npm run dev
   ```

4. Open the UI at `http://localhost:5173`.
5. Click **"Connection Config"** in the top navigation:
   - **Database URL**: Set to `https://github-encrypted-vault.vercel.app`
   - **Auto-Provision**: Click **"Auto-Create"** to have the production backend provision a dedicated project namespace and issue your signed `Project API Token`.
   - Alternatively, enter your existing `Project ID` and `Project API Token`.

---

## 4. How CRUD Works

### Create
```typescript
import { EncryptedDatabaseClient } from "./client/EncryptedDatabaseClient";

const client = new EncryptedDatabaseClient({
  baseUrl: "https://github-encrypted-vault.vercel.app",
  projectId: "my_project_id",
  projectToken: "signed_project_token_here",
});

// Create record in 'customers' collection
const result = await client.createRecord("customers", {
  name: "Alice Smith",
  email: "alice@example.com",
  phone: "+1 555-0199",
  tier: "Premium"
});

console.log("Created Record ID:", result.recordId);
console.log("Commit SHA:", result.sha);
```

### Read
```typescript
const record = await client.getRecord("customers", result.recordId);
console.log("Customer data:", record.data);
console.log("Latest SHA:", record.sha);
```

### Update with Optimistic Concurrency Control
```typescript
const updateResult = await client.updateRecord(
  "customers",
  record.recordId,
  { ...record.data, phone: "+1 555-9999" },
  record.sha // passing expectedSha prevents overwrite collisions (HTTP 409)
);
```

### Search & Filter
```typescript
// Filter by name
const matchingCustomers = await client.listRecords("customers", {
  filterField: "name",
  filterValue: "Alice Smith"
});
```

### Delete
```typescript
await client.deleteRecord("customers", record.recordId, updateResult.sha);
```

---

## 5. Security Mandates: What Credentials Must NEVER Be in Browser Code

> ⚠️ **CRITICAL SECURITY RULES FOR FRONTEND APPLICATIONS**

1. **NEVER expose `GITHUB_STORAGE_PAT`**:
   The GitHub Personal Access Token is a server-only infrastructure secret. The browser must never know or possess the GitHub PAT.

2. **NEVER expose `SESSION_SECRET`**:
   The server's HMAC session signing key must remain strictly on the backend.

3. **NEVER expose Server Master Keys / DEKs**:
   All encryption operations occur in the secure backend execution context or client zero-knowledge vault boundaries.

4. **Public vs. Private Scope**:
   - **Safe in frontend client:** `baseUrl`, `projectId`, `projectToken` (issued for the client).
   - **Forbidden in frontend client:** GitHub tokens, repository PATs, server environment variables.
