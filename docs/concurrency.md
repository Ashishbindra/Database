# Optimistic Concurrency Control

Prevent lost updates and race conditions using Git Blob SHA validation.

---

## ⚡ How It Works

1. Every document read includes its immutable `sha` calculated from the encrypted storage blob on GitHub.
2. When updating (`PUT`) or deleting (`DELETE`), client passes the `sha` received during read.
3. If another process modified the document in the interim, the current SHA in GitHub will not match the requested SHA.
4. The server rejects the mutation with **HTTP 409 Conflict** (`CONCURRENCY_CONFLICT`).

---

## 💻 Example

```typescript
// Read record
const doc = await db.getRecord("settings", "theme");

try {
  // Update with SHA check
  await db.updateRecord("settings", "theme", { mode: "dark" }, doc.sha);
} catch (err) {
  if (err.status === 409) {
    console.error("Document was modified by another concurrent request. Re-fetching...");
  }
}
```
