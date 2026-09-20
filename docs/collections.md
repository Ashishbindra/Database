# Collections

Collections are named namespaces within a project used to group related documents.

---

## 🚀 Endpoints

### 1. List Collections
- **Method**: `GET /api/db/projects/:projectId/collections`
- **Headers**: `Authorization: Bearer <projectToken>`
- **Response**: `{"success": true, "collections": ["users", "orders", "settings"]}`

### 2. Create Collection
- **Method**: `POST /api/db/projects/:projectId/collections`
- **Headers**: `Authorization: Bearer <projectToken>`
- **Body**: `{"collection": "customers"}`
- **Response**: `{"success": true, "collection": "customers"}`

*Note: Collections are also automatically created upon inserting the first record into a previously non-existent collection.*
