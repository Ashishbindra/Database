# 5-Minute Quick Start

Get from zero to a live encrypted database connection in 4 simple commands.

---

### Step 1: Install SDK

```bash
npm install github-encrypted-storage-sdk
```

---

### Step 2: Initialize Client

```typescript
import { EncryptedDatabaseClient } from "github-encrypted-storage-sdk";

const db = new EncryptedDatabaseClient({
  baseUrl: "https://github-encrypted-vault.vercel.app",
  projectId: "myapp",
  projectToken: "YOUR_PROJECT_API_TOKEN",
});
```

---

### Step 3: Write First Record

```typescript
const record = await db.createRecord("users", {
  name: "Alex Doe",
  email: "alex@example.com",
  role: "developer"
});

console.log("Created Record ID:", record.recordId);
console.log("Git Blob SHA:", record.sha);
```

---

### Step 4: Fetch & Verify

```typescript
const fetched = await db.getRecord("users", record.recordId);
console.log("Decrypted payload:", fetched.data);
```
