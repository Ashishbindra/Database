# Records & Encrypted Document CRUD

All records are transparently encrypted with AES-256-GCM before being stored to GitHub.

---

## 🚀 Endpoints

### 1. Create / Insert Record
- **Method**: `POST /api/db/projects/:projectId/collections/:collection/records`
- **Headers**: `Authorization: Bearer <projectToken>`, `Content-Type: application/json`
- **Body**: `{"data": {"name": "Alice", "role": "admin"}, "recordId": "custom_id"}`
- **Response**: `{"success": true, "recordId": "custom_id", "sha": "4a7b..."}`

### 2. Get Decrypted Record
- **Method**: `GET /api/db/projects/:projectId/collections/:collection/records/:recordId`
- **Headers**: `Authorization: Bearer <projectToken>`
- **Response**: `{"recordId": "custom_id", "data": {"name": "Alice", "role": "admin"}, "sha": "4a7b..."}`

### 3. Get Raw Envelope (Ciphertext)
- **Method**: `GET /api/db/projects/:projectId/collections/:collection/records/:recordId/raw`
- **Headers**: `Authorization: Bearer <projectToken>`
- **Response**: `{"recordId": "custom_id", "rawPersistedContent": "{\"iv\":\"...\",\"ciphertext\":\"...\"}", "isEncrypted": true}`

### 4. Update Record (Optimistic Concurrency)
- **Method**: `PUT /api/db/projects/:projectId/collections/:collection/records/:recordId`
- **Headers**: `Authorization: Bearer <projectToken>`, `Content-Type: application/json`
- **Body**: `{"data": {"name": "Alice", "role": "super-admin"}, "sha": "4a7b..."}`
- **Response**: `{"success": true, "recordId": "custom_id", "sha": "9c8e..."}`

### 5. Delete Record
- **Method**: `DELETE /api/db/projects/:projectId/collections/:collection/records/:recordId`
- **Headers**: `Authorization: Bearer <projectToken>`
- **Response**: `{"success": true, "recordId": "custom_id"}`
