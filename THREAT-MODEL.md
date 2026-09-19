# Threat Model & Risk Analysis

## 🎯 Assets & Threat Surface

| Asset | Primary Threat | Mitigation Strategy | Protection Status |
|---|---|---|---|
| **User Data (Plaintext)** | Eavesdropping / Public GitHub repository exposure | Client-side AES-256-GCM encryption before upload | 🟢 **PROTECTED** |
| **Server PAT Secret** | Repository credential leakage | PAT stored exclusively in server environment variable (`process.env.GITHUB_STORAGE_PAT`) | 🟢 **PROTECTED** |
| **Server PAT Compromise** | Malicious deletion or corruption of remote repository files by attacker who steals PAT | Rollback protection via authenticated state manifest version hashes | 🟡 **DOCUMENTED LIMITATION** (Remote availability risk if PAT compromised) |
| **Brute Force Login** | Password guessing attacks | PBKDF2 600,000 iterations + Express rate-limiting middleware | 🟢 **PROTECTED** |
| **Cross-App Data Leakage** | App A reading App B state | Authenticated `appId` metadata embedded inside ciphertext | 🟢 **PROTECTED** |
| **Local Stolen Device** | Extracting data from IndexedDB | Memory keys cleared on logout; IndexedDB wiped | 🟢 **PROTECTED** |
| **Replay / Tampering** | Replaying or modifying ciphertext | 96-bit random IVs + SHA-256 state hashes + AES-GCM AEAD tag | 🟢 **PROTECTED** |
