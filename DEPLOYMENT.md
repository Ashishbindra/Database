# Production Deployment Guide

## 🚀 Cloud Run / Container Deployment

### Environment Variables Required
Set the following environment variables in your Cloud Run container configuration:

```bash
GITHUB_STORAGE_PAT="ghp_your_actual_github_pat_here"
GITHUB_OWNER="your-github-org-or-username"
GITHUB_REPO="your-encrypted-vault-repository"
GITHUB_BRANCH="main"
SESSION_SECRET="random_64_character_hex_string"
SESSION_STORE_PROVIDER="distributed" # Options: memory (default) | distributed
```

### Build & Start Commands
```bash
# Build Vite client and bundle server.ts with esbuild into dist/server.cjs
npm run build

# Start production Node.js server
npm run start
```

### ⚡ Scaling & Container Topology
* **Single-Instance Deployment (Default)**: Set `SESSION_STORE_PROVIDER="memory"` for single-instance Cloud Run containers.
* **Horizontally Scaled Multi-Instance Deployment**: Set `SESSION_STORE_PROVIDER="distributed"` to share active sessions and revocation sets across container replicas.
* **Trusted Freshness Ledger**: Server initializes `ServerSideFreshnessLedger` to validate remote state heads and prevent fresh-device rollback attacks even under GitHub PAT compromise.

