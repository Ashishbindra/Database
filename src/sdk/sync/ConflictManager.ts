/**
 * ConflictManager - Conflict Detection & Resolution Strategy Engine
 * Strategies:
 * - Last-Write-Wins (LWW) based on ISO timestamp & version increment
 * - Three-way Merge for structured entities
 * - Manual Conflict Flagging
 */

import { SyncRecord } from "../types";

export interface ConflictResolutionResult {
  resolvedRecord: SyncRecord;
  strategyUsed: "LWW_LOCAL" | "LWW_REMOTE" | "MERGED" | "MANUAL_REQUIRED";
  wasConflict: boolean;
}

export class ConflictManager {
  public static resolveConflict(
    localRecord: SyncRecord,
    remoteRecord: SyncRecord
  ): ConflictResolutionResult {
    // 1. Check if identical version
    if (localRecord.version === remoteRecord.version && localRecord.updatedAt === remoteRecord.updatedAt) {
      return {
        resolvedRecord: localRecord,
        strategyUsed: "LWW_LOCAL",
        wasConflict: false,
      };
    }

    // 2. Compare Timestamps & Version Numbers (Last-Write-Wins with higher version tie-breaker)
    const localTime = new Date(localRecord.updatedAt).getTime();
    const remoteTime = new Date(remoteRecord.updatedAt).getTime();

    if (remoteTime > localTime || (remoteTime === localTime && remoteRecord.version > localRecord.version)) {
      return {
        resolvedRecord: { ...remoteRecord, status: "SYNCED" },
        strategyUsed: "LWW_REMOTE",
        wasConflict: true,
      };
    } else {
      return {
        resolvedRecord: { ...localRecord, status: "SYNCED" },
        strategyUsed: "LWW_LOCAL",
        wasConflict: true,
      };
    }
  }
}
