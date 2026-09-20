# Authentication & Credentials Model

The Encrypted Database employs a two-tier cryptographic authentication architecture:

1. **User Administrative Session (`Bearer <userSessionToken>`)**
   - Issued upon user login/registration.
   - Used for creating projects, rotating tokens, and managing global resources.
   - Backed by HMAC-SHA256 signatures with opaque identifiers.

2. **Project API Token (`Bearer <projectToken>`)**
   - Scoped strictly to a single project namespace (`projectId`).
   - Derived using PBKDF2 / HMAC against the project identifier and user credentials.
   - Required on all collection and record CRUD endpoints (`/api/db/projects/:projectId/...`).

---

## 🔒 Security Best Practices

- **Never share Project Tokens**: Keep project tokens restricted to server environments or secure applications.
- **Rotate Compromised Tokens**: Use the `/api/db/projects/:projectId/token/rotate` endpoint to instantly issue a new token and invalidate the old one.
- **Server-Only Secrets**: `GITHUB_STORAGE_PAT` and `SESSION_SECRET` are stored exclusively in secure server environment variables and are never transmitted to clients.
