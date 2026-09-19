/**
 * Threat Model & Security Architecture Documentation
 * Explicitly detailing security guarantees, threat mitigations, and honest platform limitations.
 */

import { ThreatModelItem } from "../sdk/types";

export const THREAT_MODEL: ThreatModelItem[] = [
  {
    id: "TM-01",
    threat: "Public GitHub Repository Inspection & Data Theft",
    vector: "Attacker clones or reads a public GitHub repository hosting user data files.",
    mitigation: "All private user data is encrypted client-side using AES-256-GCM prior to upload. Filenames use opaque user IDs (`u_7f8a9b2c...`). No plaintext PII exists on GitHub.",
    status: "PROTECTED",
    requirementRef: "Req 2, 3, 11, 20",
  },
  {
    id: "TM-02",
    threat: "Cross-User Decryption Attempt",
    vector: "User A downloads User B's encrypted GitHub file and attempts to decrypt it.",
    mitigation: "Each user possesses a distinct, randomly generated Data Encryption Key (DEK). User A's key cannot satisfy the AES-256-GCM AEAD authentication tag of User B's payload.",
    status: "PROTECTED",
    requirementRef: "Req 4, 21",
  },
  {
    id: "TM-03",
    threat: "Hardcoded Credential Extraction via Reverse Engineering",
    vector: "Attacker decompiles APK / inspects JS bundle to find embedded master keys or GitHub Personal Access Tokens.",
    mitigation: "Zero GitHub tokens or encryption keys are hardcoded in source code or APK. GitHub PATs are managed dynamically in memory/local settings. Keys are derived per-user using PBKDF2.",
    status: "PROTECTED",
    requirementRef: "Req 5, 9, 28",
  },
  {
    id: "TM-04",
    threat: "Remote Payload Tampering / Data Corruption",
    vector: "A malicious actor modifies encrypted bytes directly inside GitHub storage.",
    mitigation: "AES-256-GCM AEAD authentication tag + SHA-256 checksum verification detects bit flips and unauthorized modifications, rejecting corrupted files before local database ingestion.",
    status: "PROTECTED",
    requirementRef: "Req 3, 18",
  },
  {
    id: "TM-05",
    threat: "Cross-App Data Leakage (App A reading App B)",
    vector: "Malicious or faulty logic tries to load 'ResumeCraft' data into 'Shramik Hisab'.",
    mitigation: "Ciphertexts embed authenticated metadata (`app_id`, `user_id`, `schema_version`). Decryption fails immediately if requested context does not match authenticated payload metadata.",
    status: "PROTECTED",
    requirementRef: "Req 1, 12, 29",
  },
  {
    id: "TM-06",
    threat: "Lost Phone / App Reinstall Data Recovery",
    vector: "User loses physical device or uninstalls app and reinstalls on a new phone.",
    mitigation: "User authenticates with password or 24-word recovery phrase, unwraps DEK from GitHub-stored envelope, and downloads remote encrypted bundle to restore local IndexedDB.",
    status: "PROTECTED",
    requirementRef: "Req 6, 22, 23",
  },
  {
    id: "TM-07",
    threat: "GitHub Account / Write Access Tampering",
    vector: "Public GitHub repository allows open public writes without authentication.",
    mitigation: "GitHub itself is a versioned storage system, not a multi-user auth database. Writing to real GitHub requires a user-configured Fine-grained Personal Access Token. Public repos allow open reads, but writes require token auth.",
    status: "DOCUMENTED_LIMITATION",
    requirementRef: "Req 8, 9, 10",
  },
  {
    id: "TM-08",
    threat: "Permanent Loss of Both Password AND 24-Word Recovery Phrase",
    vector: "User forgets password and loses 24-word recovery backup phrase.",
    mitigation: "Because this is true Zero-Knowledge End-to-End Encryption, data cannot be decrypted without the key. No master backdoors or plaintext copies exist on GitHub.",
    status: "DOCUMENTED_LIMITATION",
    requirementRef: "Req 6, 7, 32",
  },
  {
    id: "TM-09",
    threat: "Git Revision History Retention upon File Deletion",
    vector: "Deleting a user profile file in Git leaves historical commits in repository history.",
    mitigation: "Deleting a file creates a deletion commit, but previous encrypted blobs remain in Git history. Since historical blobs are AEAD-encrypted, they remain unreadable without DEK.",
    status: "DOCUMENTED_LIMITATION",
    requirementRef: "Req 25",
  },
];
