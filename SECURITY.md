# Security Architecture & Cryptographic Policies

## 🔒 Cryptographic Specifications

| Component | Standard / Algorithm | Parameters | Purpose |
|---|---|---|---|
| **Data Encryption Key (DEK)** | AES-256-GCM | 256-bit WebCrypto random key | Encrypts user application state payloads |
| **Key Encryption Key (KEK)** | PBKDF2-HMAC-SHA256 | 600,000 iterations, 32-byte salt | Wraps DEK using user master password |
| **Recovery KEK** | BIP-39 + PBKDF2-SHA256 | 256-bit entropy, 24 words, SHA-256 checksum | Emergency DEK recovery when password is lost |
| **Password Auth Proof** | HMAC-SHA256 | Derived with 100,000 PBKDF2 iterations | Server-verified authentication proof |
| **Initialization Vector (IV)** | Cryptographic Random | 12 bytes (96 bits) per encryption | Prevents AES-GCM replay attacks |
| **Session Signatures** | HMAC-SHA256 | 256-bit server secret | Signs client session tokens |

---

## 🛡️ Key Security Guarantees

1. **Zero Client-Side PAT Exposure**: The GitHub Personal Access Token (PAT) is never sent to or stored in client browser memory. All GitHub REST operations are mediated by `server.ts`.
2. **End-to-End Encryption (E2E)**: Data is encrypted inside client memory before transmission. The server proxy and GitHub remote store only high-entropy ciphertext.
3. **Multi-App & Multi-User Boundary Enforcement**: Every ciphertext envelope embeds authenticated metadata (`appId` and `userId`). Mismatched contexts trigger immediate AEAD rejection.
4. **Server-Side State Chain Enforcement**: The server proxy validates `incoming.previousStateHash === currentHead.stateHash` and `dataVersion === headVersion + 1`. Unmatched state chains or out-of-order writes are rejected with HTTP 409 Conflict.
5. **Trusted Server-Side Freshness Anchor**: Server maintains an independent `FreshnessLedger` recording `{ opaqueUserId, appId, headVersion, headStateHash }`. A compromised GitHub PAT cannot modify the server freshness ledger. Fresh devices logging in for the first time compare remote state against the trusted freshness ledger and abort restoration with `REMOTE_STATE_ROLLBACK_DETECTED` if GitHub storage has been rolled back.
6. **Distributed Multi-Instance Session Management**: `SessionStore` provider abstraction provides `InMemorySessionStore` for single-instance development and `DistributedSessionStore` for horizontally scaled multi-replica deployments. Revocations on one instance propagate across all replicas.
7. **Immediate Memory Zeroing on Logout**: Logging out nullifies memory references to active DEKs, revokes server session tokens via `SessionStore`, and purges all working records from IndexedDB.
8. **Constant-Time Verification**: Server password proofs are verified using `crypto.timingSafeEqual()` to eliminate timing side-channel attacks.

---

## ⚡ Multi-Instance & Deployment Topology

1. **Session Store Provider**:
   * `SESSION_STORE_PROVIDER="memory"`: Uses process memory for single-instance container deployments.
   * `SESSION_STORE_PROVIDER="distributed"`: Uses shared `DistributedSessionStore` for horizontally scaled multi-replica Cloud Run containers.
2. **Freshness Ledger Operations**:
   * Isolated from GitHub storage credentials.
   * Zero plaintext private records, passwords, or DEKs stored in freshness records.
   * Fails closed with 503 error if freshness ledger becomes unreachable.
