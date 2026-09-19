# State Synchronization & Conflict Resolution Protocol

## 🔄 Last-Write-Wins (LWW) & Version Manifests

1. **Local Mutation Queue**:
   * Operations executed offline are stored in IndexedDB under the `sync_queue` table with status `PENDING`.
2. **Conflict Detection**:
   * When syncing state with `/api/vault/sync`, the server checks state file versions and SHAs.
   * If a concurrent write occurred, the server returns `409 Conflict`.
3. **Resolution Strategy**:
   * The client fetches the remote bundle, decrypts it using DEK, compares version timestamps on each entity record, and applies Last-Write-Wins (LWW) merging.
   * Increments data version, re-encrypts state envelope, and re-submits to server.
