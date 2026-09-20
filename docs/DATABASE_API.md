# Encrypted Multi-Project Database Service API Documentation

The **Encrypted Database Service** provides multi-tenant, cloud-persisted NoSQL document storage over HTTP. All records are encrypted at rest using server-side **AES-256-GCM** authenticated encryption with project-isolated key derivation and backed transparently by GitHub storage.

---

## 1. Overview & Architecture

- **Protocol**: HTTP/HTTPS REST API (JSON payloads)
- **Base URL**:
  - Development / Container: `http://localhost:3000`
  - Production / Serverless: `https://<deployment-host>`
- **Storage Backend**: GitHub Git Repository (under `data/apps/{projectId}/collections/{collection}/records/{recordId}.json`)
- **Encryption at Rest**: AES-256-GCM with PBKDF2-derived keys per project. No plaintext data is ever written to disk or repository commits.
- **Concurrency Model**: Optimistic Concurrency Control using Git object SHA hashes.

---

## 2. Authentication Model

The Database API uses a two-tier authentication hierarchy:

1. **User Session Token (`Bearer <userSessionToken>`)**: Used by administrators/developers to create and manage projects (`/api/db/projects`).
2. **Project API Token (`Bearer <projectToken>`)**: Used by applications to access their dedicated project namespace and collections (`/api/db/projects/:projectId/...`).
   - Format: `<base64url-payload>.<hmac-sha256-signature>`
   - Contains: `projectId`, `opaqueUserId`, `issuedAt`
   - Signed using server HMAC key.
   - Applications **only** require this Project Token. Applications **never** require GitHub PATs or server master secrets.

---

## 3. Project Management API

### 3.1 Create Project
Creates an isolated database namespace and issues a cryptographically signed Project API Token.

- **Method**: `POST`
- **Endpoint**: `/api/db/projects`
- **Headers**:
  - `Authorization: Bearer <userSessionToken>`
  - `Content-Type: application/json`
- **Request Body**:
```json
{
  "projectId": "my_ecommerce_app"
}
```

- **Response (200 OK)**:
```json
{
  "success": true,
  "projectId": "my_ecommerce_app",
  "projectToken": "eyJwcm9qZWN0SWQiOiJteV9lY29tbWVyY2VfYXBwIn0.d9f8e7...",
  "message": "Project created successfully."
}
```

- **Curl Example**:
```bash
curl -X POST https://api.example.com/api/db/projects \
  -H "Authorization: Bearer <userSessionToken>" \
  -H "Content-Type: application/json" \
  -d '{"projectId": "my_ecommerce_app"}'
```

---

### 3.2 List Projects
Retrieves all projects owned by the authenticated user.

- **Method**: `GET`
- **Endpoint**: `/api/db/projects`
- **Headers**:
  - `Authorization: Bearer <userSessionToken>`
- **Response (200 OK)**:
```json
{
  "projects": [
    {
      "projectId": "my_ecommerce_app",
      "projectToken": "eyJwcm9qZWN0SWQiOiJteV9lY29tbWVyY2VfYXBwIn0.d9f8e7...",
      "createdAt": "2026-09-19T22:00:00.000Z"
    }
  ]
}
```

- **Curl Example**:
```bash
curl -X GET https://api.example.com/api/db/projects \
  -H "Authorization: Bearer <userSessionToken>"
```

---

## 4. Collection Management API

### 4.1 Create Collection
Initializes a new collection within a project namespace.

- **Method**: `POST`
- **Endpoint**: `/api/db/projects/:projectId/collections`
- **Headers**:
  - `Authorization: Bearer <projectToken>`
  - `Content-Type: application/json`
- **Request Body**:
```json
{
  "collection": "customers"
}
```

- **Response (200 OK)**:
```json
{
  "success": true,
  "projectId": "my_ecommerce_app",
  "collection": "customers",
  "message": "Collection created successfully."
}
```

- **Curl Example**:
```bash
curl -X POST https://api.example.com/api/db/projects/my_ecommerce_app/collections \
  -H "Authorization: Bearer <projectToken>" \
  -H "Content-Type: application/json" \
  -d '{"collection": "customers"}'
```

---

### 4.2 List Collections
Lists all collections initialized in the project namespace.

- **Method**: `GET`
- **Endpoint**: `/api/db/projects/:projectId/collections`
- **Headers**:
  - `Authorization: Bearer <projectToken>`
- **Response (200 OK)**:
```json
{
  "collections": [
    "customers",
    "orders"
  ]
}
```

- **Curl Example**:
```bash
curl -X GET https://api.example.com/api/db/projects/my_ecommerce_app/collections \
  -H "Authorization: Bearer <projectToken>"
```

---

## 5. Record CRUD & Query API

### 5.1 Create Record
Inserts a new record into a collection. Encrypts the payload with AES-256-GCM before writing to the storage provider.

- **Method**: `POST`
- **Endpoint**: `/api/db/projects/:projectId/collections/:collection/records`
- **Headers**:
  - `Authorization: Bearer <projectToken>`
  - `Content-Type: application/json`
- **Request Body**:
```json
{
  "recordId": "cust_001",
  "data": {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "tier": "enterprise",
    "balance": 15000
  }
}
```
*(Note: If `recordId` is omitted, the server automatically generates a secure 16-byte random hex identifier).*

- **Response (200 OK)**:
```json
{
  "success": true,
  "recordId": "cust_001",
  "sha": "9f83ac0b1c0e35f4...",
  "message": "Record inserted successfully."
}
```

- **Curl Example**:
```bash
curl -X POST https://api.example.com/api/db/projects/my_ecommerce_app/collections/customers/records \
  -H "Authorization: Bearer <projectToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "recordId": "cust_001",
    "data": {
      "name": "Jane Doe",
      "email": "jane@example.com",
      "tier": "enterprise"
    }
  }'
```

---

### 5.2 Read Record
Retrieves a record by ID and transparently decrypts its data payload.

- **Method**: `GET`
- **Endpoint**: `/api/db/projects/:projectId/collections/:collection/records/:recordId`
- **Headers**:
  - `Authorization: Bearer <projectToken>`
- **Response (200 OK)**:
```json
{
  "recordId": "cust_001",
  "data": {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "tier": "enterprise",
    "balance": 15000
  },
  "sha": "9f83ac0b1c0e35f4..."
}
```

- **Curl Example**:
```bash
curl -X GET https://api.example.com/api/db/projects/my_ecommerce_app/collections/customers/records/cust_001 \
  -H "Authorization: Bearer <projectToken>"
```

---

### 5.3 Update Record (Optimistic Concurrency)
Updates an existing record. Supports SHA verification to prevent lost updates or concurrent race conditions.

- **Method**: `PUT`
- **Endpoint**: `/api/db/projects/:projectId/collections/:collection/records/:recordId`
- **Headers**:
  - `Authorization: Bearer <projectToken>`
  - `Content-Type: application/json`
- **Request Body**:
```json
{
  "data": {
    "name": "Jane Doe",
    "email": "jane.doe@example.com",
    "tier": "enterprise",
    "balance": 17500
  },
  "expectedSha": "9f83ac0b1c0e35f4..."
}
```

- **Response (200 OK)**:
```json
{
  "success": true,
  "recordId": "cust_001",
  "sha": "4e1a89c20f781b99...",
  "message": "Record updated successfully."
}
```

- **Conflict Response (409 Conflict)**:
If `expectedSha` does not match the current storage commit SHA, the server rejects the update:
```json
{
  "error": "Conflict",
  "message": "SHA mismatch: resource has been modified concurrently."
}
```

- **Curl Example**:
```bash
curl -X PUT https://api.example.com/api/db/projects/my_ecommerce_app/collections/customers/records/cust_001 \
  -H "Authorization: Bearer <projectToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "data": { "name": "Jane Doe", "email": "jane.doe@example.com" },
    "expectedSha": "9f83ac0b1c0e35f4..."
  }'
```

---

### 5.4 Delete Record
Deletes a record from the collection.

- **Method**: `DELETE`
- **Endpoint**: `/api/db/projects/:projectId/collections/:collection/records/:recordId`
- **Headers**:
  - `Authorization: Bearer <projectToken>`
  - `Content-Type: application/json`
- **Optional Request Body / Query Parameter**:
  - `expectedSha`: SHA hash to enforce optimistic concurrency before deletion.
- **Response (200 OK)**:
```json
{
  "success": true,
  "message": "Record deleted successfully."
}
```

- **Curl Example**:
```bash
curl -X DELETE https://api.example.com/api/db/projects/my_ecommerce_app/collections/customers/records/cust_001 \
  -H "Authorization: Bearer <projectToken>"
```

---

### 5.5 List & Query Records
Lists all records in a collection, with support for field-based filtering.

- **Method**: `GET`
- **Endpoint**: `/api/db/projects/:projectId/collections/:collection/records`
- **Headers**:
  - `Authorization: Bearer <projectToken>`
- **Optional Query Parameters**:
  - `filterField`: Key in record payload to filter by (e.g. `tier`).
  - `filterValue`: Expected value (e.g. `enterprise`).
- **Response (200 OK)**:
```json
{
  "records": [
    {
      "recordId": "cust_001",
      "data": {
        "name": "Jane Doe",
        "email": "jane.doe@example.com",
        "tier": "enterprise"
      },
      "sha": "4e1a89c20f781b99..."
    }
  ]
}
```

- **Curl Example**:
```bash
curl -X GET "https://api.example.com/api/db/projects/my_ecommerce_app/collections/customers/records?filterField=tier&filterValue=enterprise" \
  -H "Authorization: Bearer <projectToken>"
```

---

## 6. HTTP Status Codes & Error Responses

All API errors return standard JSON envelopes:
```json
{
  "error": "ErrorCategory",
  "message": "Detailed description of the issue."
}
```

| HTTP Status | Name | Cause |
|---|---|---|
| **200** | OK | Operation completed successfully. |
| **400** | Bad Request | Missing required fields, invalid identifier format, or malformed JSON. |
| **401** | Unauthorized | Missing, expired, malformed, or tampered `Authorization` token. |
| **403** | Forbidden | Token is valid but does not have permission for the requested `projectId` (Strict Tenant Isolation). |
| **404** | Not Found | Target collection or record does not exist. |
| **409** | Conflict | Duplicate project ID on creation, or Optimistic Concurrency SHA mismatch. |
| **500** | Internal Error | Storage or encryption failure. |
| **503** | Service Unavailable | Backend storage provider (e.g., GitHub PAT) is unconfigured. |

---

## 7. Security & Isolation Model

1. **Cryptographic Multi-Tenancy**:
   - Each project has a distinct encryption key namespace derived via HMAC-SHA256 from server secrets and the `projectId`.
   - Even if raw storage files were leaked, documents from Project A cannot be decrypted with keys from Project B.
2. **Access Control (RBAC)**:
   - Tokens issued for Project A are cryptographically rejected with `403 Forbidden` if supplied to any endpoint under `/api/db/projects/ProjectB/...`.
3. **Path Traversal Defense**:
   - Strict regex validation (`/^[a-zA-Z0-9_-]+$/`) applied to `projectId`, `collection`, and `recordId`.
   - Any path traversal characters (`..`, `/`, `\`, `%2e`, `%2f`, null bytes) are blocked.
4. **Zero Plaintext at Rest**:
   - Raw records stored in GitHub contain only `{ "iv": "...", "ciphertext": "...", "tag": "..." }`.

---

## 8. Rate Limiting & Operational Best Practices

- **Batching & Concurrency**: Avoid burst parallel inserts of 100+ items simultaneously against a single GitHub repository branch to prevent secondary rate limits from upstream providers.
- **SHA Caching**: Cache the `sha` returned from `createRecord` and `getRecord` to supply in `expectedSha` for safe atomic mutations.
- **Client SDK**: Use `@google/encrypted-database-sdk` (`EncryptedDatabaseClient`) for automatic header management, error parsing, and type safety.
