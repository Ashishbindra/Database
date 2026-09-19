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

## 🚀 Quick Start & Integration

```typescript
import { CentralDataClient } from "./sdk/CentralDataClient";

// Initialize SDK
const sdk = new CentralDataClient();
await sdk.init();

// Register User Account
const { profile, recoveryWords } = await sdk.authManager.register("john_doe", "SecretPassword123!");
console.log("Save your 24-word recovery phrase safely:", recoveryWords.join(" "));

// Save Record in Shramik Hisab
await sdk.saveAppRecord("shramik_hisab", "workers", {
  id: "w1",
  name: "Ramesh Kumar",
  dailyWage: 850,
});

// Sync to Cloud Storage
await sdk.syncApp("shramik_hisab");
```

---

## 🧪 Security Test Suite

The SDK includes 25 automated browser security test assertions (`SEC-01` through `SEC-25`):
* `SEC-01`: User A cannot decrypt User B data
* `SEC-02`: Wrong password fails auth proof & key unwrapping
* `SEC-03`: AEAD ciphertext tamper detection
* `SEC-04`: Multi-app isolation enforcement
* `SEC-05`: 24-Word standard BIP-39 recovery phrase checksum
* `SEC-06`: App uninstall / reinstall cloud state restoration
* `SEC-07`: Zero plaintext private data on remote storage
* `SEC-08`: Nonce uniqueness across 100 encryption operations
* `SEC-11`: Zero Client PAT exposure
* `SEC-14`: IndexedDB working database purge on logout

Run all assertions directly via the UI **Security Tests** tab or call `SecurityTestRunner.runAllTests()`.
