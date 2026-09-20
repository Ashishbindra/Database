# Security & Threat Model

The Encrypted Database API is designed from the ground up to guarantee strict multi-tenant isolation, data confidentiality, and zero secret exposure.

---

## 🛡️ Core Security Architecture

1. **Zero Plaintext at Rest**
   - Every document is encrypted using industry-standard **AES-256-GCM** before touching GitHub.
   - Each write generates a cryptographically random 12-byte initialization vector (IV).
   - Authenticated encryption ensures both confidentiality and tampering detection (via 16-byte Auth Tag).

2. **Isolated Project Boundaries**
   - Each project has an HMAC-derived authentication token.
   - Even with a valid token for Project A, any attempt to access `/api/db/projects/ProjectB/...` is rejected at the middleware level with `403 Forbidden`.

3. **Client-Side Secret Decoupling**
   - The SDK and browser clients communicate strictly over HTTP.
   - Neither `GITHUB_STORAGE_PAT` nor `SESSION_SECRET` is ever exposed, imported, or accessible to client bundles.

4. **Path Traversal & Injection Defense**
   - All input paths, collection names, and record IDs are sanitized with strict character whitelist validation.
   - Path traversal tokens (`..`, `../`, `..\`, `%2e%2e`, `/etc/passwd`) are rejected with `400 Bad Request`.
