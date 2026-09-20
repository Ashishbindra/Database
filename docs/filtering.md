# Field Filtering & Pagination

List records with server-side query filters and pagination.

---

## 🔍 Exact Field Match Filtering

Query parameters matching top-level field names will filter the returned decrypted documents:

```bash
# Query only active admins
GET /api/db/projects/:projectId/collections/users/records?role=admin&active=true
```

Via SDK:
```typescript
const activeAdmins = await db.listRecords("users", { role: "admin", active: true });
```

---

## 📄 Pagination

Use `page` and `limit` query parameters for paginated output:

```bash
GET /api/db/projects/:projectId/collections/users/records?page=1&limit=25
```

Response format:
```json
{
  "page": 1,
  "limit": 25,
  "total": 142,
  "totalPages": 6,
  "records": [ ... ]
}
```

Via SDK:
```typescript
const result = await db.listRecordsPaginated("users", 1, 25, { role: "admin" });
```
