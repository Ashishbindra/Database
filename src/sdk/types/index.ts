/**
 * Core Types for GitHub Encrypted Storage SDK
 */

export interface WrappedKeyEnvelope {
  algorithm: "AES-256-GCM";
  nonceHex: string;
  ciphertextHex: string; // Base64 or Hex encoded AES-256-GCM ciphertext + auth tag
}

export interface UserProfileRemote {
  userId: string; // Opaque hash-based user identifier (e.g., u_7f8a9b2c...)
  username: string; // Display username (never used as raw directory name)
  saltHex: string; // 32-byte salt for KEK derivation
  authProofHash: string; // SHA-256 hash of derived AuthToken (Server Verified)
  wrappedDek: WrappedKeyEnvelope; // DEK encrypted with Password-derived KEK
  recoveryWrappedDek?: WrappedKeyEnvelope; // DEK encrypted with 24-word Recovery Phrase
  recoveryWordsCount?: number;
  createdAt: string;
  updatedAt: string;
  schemaVersion: number;
}

export interface EncryptedPayloadMetadata {
  appId: string;
  userId: string;
  schemaVersion: number;
  dataVersion: number;
  timestamp: string;
}

export interface EncryptedFileEnvelope {
  formatVersion: 1;
  appId: string;
  userId: string;
  schemaVersion: number;
  dataVersion: number;
  stateHash?: string;
  previousStateHash?: string;
  createdAt: string;
  updatedAt: string;
  encryption: {
    algorithm: "AES-256-GCM";
    nonceHex: string;
    saltHex: string;
    iterations: number;
  };
  ciphertextHex: string;
  checksumHex: string; // SHA-256 integrity digest of ciphertext
}

export interface DecryptedBundle<T = any> {
  metadata: EncryptedPayloadMetadata;
  records: Record<string, T>;
}

export interface AppRegistration {
  appId: string;
  appName: string;
  schemaVersion: number;
  entities: string[];
  publicDataSource?: string;
  encryptionRequired: boolean;
  description: string;
}

export interface SyncRecord {
  id: string;
  appId: string;
  userId: string;
  entity: string;
  data: any;
  version: number;
  isDeleted: boolean;
  updatedAt: string;
  syncedAt?: string | null;
  status: "PENDING" | "SYNCING" | "SYNCED" | "CONFLICT" | "ERROR";
  conflictReason?: string;
}

export interface GitHubConfig {
  mode: "SERVER" | "MOCK" | "REAL";
  owner: string;
  repo: string;
  branch: string;
  pat: string;
}

export interface RemoteFileEntry {
  path: string;
  sha: string;
  content: string;
  updatedAt: string;
  type?: "tree" | "blob";
}

export interface SecurityTestResult {
  id: string;
  name: string;
  category: "ENCRYPTION" | "ISOLATION" | "RECOVERY" | "INTEGRITY" | "AUTHENTICATION" | "PRIVACY";
  status: "PASSED" | "FAILED" | "RUNNING" | "PENDING";
  message: string;
  details?: string;
  durationMs?: number;
}

export interface ThreatModelItem {
  id: string;
  threat: string;
  vector: string;
  mitigation: string;
  status: "PROTECTED" | "DOCUMENTED_LIMITATION";
  requirementRef: string;
}
