# GitHub-Based Encrypted Multi-App Data Storage SDK

Production-quality, zero-cost, end-to-end encrypted data storage SDK designed for multi-application ecosystems. Uses **GitHub REST API** as the primary remote storage layer, coupled with client-side **AES-256-GCM** authenticated encryption, standard **24-word BIP-39** key recovery (256-bit entropy + SHA-256 checksum), and a **Node.js/Express Authorization Proxy Server** that eliminates client-side PAT exposure.

---

## 🌟 Key Features

* 🔐 **Client-Side E2E AES-256-GCM Encryption**: All data is encrypted locally using WebCrypto before leaving the browser device.
* 🔑 **24-Word Standard BIP-39 Recovery**: 256-bit entropy generator, 8-bit SHA-256 checksum, 2048 English wordlist for account recovery.
* 🛡️ **Zero-PAT Client Architecture**: Personal Access Tokens (PAT) and GitHub credentials reside strictly in server-side environment variables (`process.env.GITHUB_STORAGE_PAT`).
* 📦 **Multi-App Data Isolation**: Unique `appId` metadata bound inside authenticated payloads prevents cross-app data leakage.
* 💾 **Offline-First IndexedDB Storage**: Working database and offline mutation queues operate without network connectivity.
* 🔄 **Automatic Synchronization**: Last-Write-Wins (LWW) merging with 409 conflict backoff and state version manifests.
* 📱 **Multi-Device & Reinstall Recovery**: Full cloud restore following app uninstalls or device switches.
* 💰 **100% Zero-Cost Architecture**: Operates within Cloud Run / container free tiers and GitHub free repository limits.

---

## 🏗️ System Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT BROWSER (SPA)                      │
│                                                             │
│  ┌──────────────────────┐      ┌─────────────────────────┐  │
│  │   App Modules        │      │   WebCrypto Engine      │  │
│  │ (Shramik Hisab,      │      │ - AES-256-GCM           │  │
│  │  ResumeCraft, etc.)  │      │ - PBKDF2 (600k iter)    │  │
│  └──────────┬───────────┘      │ - BIP-39 (256-bit)      │  │
│             │                  └────────────┬────────────┘  │
│             ▼                               │               │
│  ┌──────────────────────┐                   │ DEK / KEK     │
│  │   IndexedDB Cache    │◄──────────────────┘               │
│  │  & Offline Queue     │                                   │
│  └──────────┬───────────┘                                   │
└─────────────┼───────────────────────────────────────────────┘
              │ HTTPS JSON (/api/vault/*)
              │ Bearer <SessionToken> (No PAT!)
              ▼
┌─────────────────────────────────────────────────────────────┐
│                 SERVER PROXY (server.ts)                    │
│                                                             │
│  - Session HMAC Token Verification                           │
│  - Path-based User Isolation Enforcement                    │
│  - Constant-time Auth Proof Verification                    │
│  - Rate Limiting & Security Headers                         │
│  - Server-Side GITHUB_STORAGE_PAT Environment Credential    │
└─────────────┬───────────────────────────────────────────────┘
              │ HTTPS GitHub REST API
              │ Header: Authorization: token <GITHUB_PAT>
              ▼
┌─────────────────────────────────────────────────────────────┐
│               PRIMARY REMOTE STORAGE (GitHub)               │
│                                                             │
│  Path: data/users/<opaqueUserId>/vault/<appId>/state.json    │
│  Payload: High-entropy AES-256-GCM ciphertext envelope       │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 5-Minute Developer Quickstart (Encrypted Database Client SDK)

Install the client package:

```bash
npm install github-encrypted-storage-sdk
```

Connect and perform encrypted operations in under 5 minutes:

```typescript
import { EncryptedDatabaseClient } from "github-encrypted-storage-sdk";

// 1. Initialize client using public credentials
const db = new EncryptedDatabaseClient({
  baseUrl: process.env.DATABASE_URL || "https://github-encrypted-vault.vercel.app",
  projectId: process.env.DATABASE_PROJECT_ID || "my-app",
  projectToken: process.env.DATABASE_PROJECT_TOKEN || "pt_live_...",
});

// 2. Health check
const health = await db.checkHealth();
console.log("Database status:", health.status);

// 3. Ensure collection exists
await db.createCollection("users");

// 4. Insert encrypted record (Transparent AES-256-GCM)
const newRecord = await db.createRecord("users", {
  name: "Alex Doe",
  email: "alex@example.com",
  role: "developer"
}, "user_001");
console.log("Created Record ID:", newRecord.recordId, "Git Blob SHA:", newRecord.sha);

// 5. Read decrypted record
const record = await db.getRecord("users", "user_001");
console.log("Decrypted payload:", record.data);

// 6. Update with optimistic concurrency
const updated = await db.updateRecord(
  "users",
  "user_001",
  { ...record.data, role: "lead-architect" },
  record.sha // Prevents race conditions
);

// 7. Inspect remote raw ciphertext envelope
const rawEnvelope = await db.getRawEnvelope("users", "user_001");
console.log("Remote Ciphertext Envelope:", rawEnvelope.rawPersistedContent);
```

---

## 🔒 Configuration & Environment Separation Audit

| Variable | Scope | Description | Allowed in Client Bundle? |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | Public / Client | Base API URL (e.g. `https://...`) | ✅ **YES** |
| `DATABASE_PROJECT_ID` | Public / Client | Project namespace ID | ✅ **YES** |
| `DATABASE_PROJECT_TOKEN`| Public / Client | Scoped HMAC Project API Token | ✅ **YES** (App scope) |
| `GITHUB_STORAGE_PAT` | **Server-Only** | GitHub Personal Access Token | ❌ **STRICTLY FORBIDDEN** |
| `SESSION_SECRET` | **Server-Only** | HMAC Signing Secret & Master Key | ❌ **STRICTLY FORBIDDEN** |
| `GITHUB_OWNER` | Server-Only | Target GitHub Org / Username | ❌ Server Config |
| `GITHUB_REPO` | Server-Only | Target GitHub Repository | ❌ Server Config |
| `GITHUB_BRANCH` | Server-Only | Target Git Branch | ❌ Server Config |

---

## 🧪 Comprehensive Verification & Test Suites

The repository contains automated test suites covering all architectural layers:

```bash
# Full release verification
npm test

# Phase-by-phase test suites
npm run test:phase1      # Phase 1: Dashboard API & Onboarding
npm run test:phase2      # Phase 2: Public Database REST API
npm run test:phase3      # Phase 3: Developer Experience & Interactive Tools
npm run test:phase4      # Phase 4: Production Audit & Resiliency
npm run test:phase5      # Phase 5: SDK Packaging & Distribution
npm run test:phase6      # Phase 6: External App Integration & Release Readiness

# Integration & Security suites
npm run test:external    # External client integration suite
npm run test:sdk         # Encrypted Database SDK integration
npm run test:database    # Database REST API integration
npm run test:security    # 109 automated WebCrypto security tests
npm run test:routing     # Routing & static asset serving
npm run test:serverless  # Serverless vercel handler tests
npm run test:github      # GitHub storage engine integration
```
