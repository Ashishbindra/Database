# Architecture Overview

## 🏛️ System Layers

### 1. Client Browser SPA Layer
* **AppRegistry**: Registers integrated apps (`shramik_hisab`, `resume_craft`, `docu_sahayak`).
* **CryptoManager**: WebCrypto AES-256-GCM, PBKDF2-SHA256, SHA-256 digests.
* **BIP39**: 256-bit entropy generator, 24-word English dictionary, SHA-256 checksum validator.
* **KeyManager**: Holds active DEK in memory during session; zeroed on lock/logout.
* **IndexedDBStorage**: Local working database and offline mutation queue (`sync_queue`).
* **AuthManager**: Handles registration, login, 24-word recovery, session tokens.
* **SyncManager**: Manages LWW merging, 409 conflict handling, cloud state restoration.

### 2. Server Authorization Proxy (`server.ts`)
* Express.js framework running on port 3000.
* Rate limiting (max 10-15 req/min on auth endpoints).
* Security headers (CSP, X-Frame-Options, X-Content-Type-Options).
* Path-based user isolation (`data/users/<opaqueUserId>/...`).
* Server environment variable credential storage (`GITHUB_STORAGE_PAT`).

### 3. Remote GitHub Storage
* Directory layout:
  * `data/users_index/<usernameHash>.json` -> Maps username hash to opaqueUserId.
  * `data/users/<opaqueUserId>/account/auth-config.json` -> Account configuration and key envelopes.
  * `data/users/<opaqueUserId>/vault/<appId>/state.json` -> High-entropy AES-256-GCM encrypted application bundle.
