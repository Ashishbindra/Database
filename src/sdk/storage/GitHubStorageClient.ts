/**
 * GitHubStorageClient - Secure Bridge to Server Vault API Proxy
 * Routes storage calls through the server authorization layer (/api/vault/*).
 * Ensures NO GitHub Personal Access Token (PAT) or repository credentials exist on the client side.
 */

import { GitHubConfig, RemoteFileEntry } from "../types";
import { GitHubMockRemote } from "./GitHubMockRemote";

export class GitHubStorageClient {
  private config: GitHubConfig;
  private sessionTokenSupplier: (() => string | null) | null = null;

  constructor(config: GitHubConfig) {
    this.config = config;
  }

  public setSessionTokenSupplier(supplier: () => string | null) {
    this.sessionTokenSupplier = supplier;
  }

  public updateConfig(newConfig: Partial<GitHubConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  public getConfig(): GitHubConfig {
    return { ...this.config, pat: "" }; // Ensure PAT is never returned or held
  }

  // Fetch application vault state from Server Vault Proxy
  public async getState(appId: string): Promise<{ state: any; sha?: string } | null> {
    if (this.config.mode === "MOCK") {
      const mockFile = await GitHubMockRemote.getFile(`vault/${appId}/state.json`);
      return mockFile ? { state: JSON.parse(mockFile.content), sha: mockFile.sha } : null;
    }

    const token = this.sessionTokenSupplier ? this.sessionTokenSupplier() : null;
    if (!token) return null;

    try {
      const res = await fetch(`/api/vault/state?appId=${encodeURIComponent(appId)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) return null;
      const data = await res.json();
      return data.exists ? { state: data.state, sha: data.sha } : null;
    } catch {
      return null;
    }
  }

  // Put / Sync application vault state to Server Vault Proxy
  public async syncState(appId: string, stateObject: any): Promise<{ sha: string; syncedAt: string }> {
    if (this.config.mode === "MOCK") {
      const entry = await GitHubMockRemote.putFile(
        `vault/${appId}/state.json`,
        JSON.stringify(stateObject),
        "Vault state updated"
      );
      return { sha: entry.sha, syncedAt: new Date().toISOString() };
    }

    const token = this.sessionTokenSupplier ? this.sessionTokenSupplier() : null;
    if (!token) {
      throw new Error("Unauthorized: Active session token required for state sync.");
    }

    const res = await fetch("/api/vault/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        appId,
        stateObject,
      }),
    });

    if (res.status === 409) {
      const errData = await res.json().catch(() => ({}));
      throw { status: 409, message: errData.message || "409 Sync Conflict: Remote state updated concurrently." };
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(`Sync Error (${res.status}): ${errData.message || res.statusText}`);
    }

    const data = await res.json();
    return { sha: data.sha, syncedAt: data.syncedAt };
  }

  // Legacy getFile fallback compatibility
  public async getFile(path: string): Promise<{ content: string; sha: string } | null> {
    if (this.config.mode === "MOCK") {
      const mockFile = await GitHubMockRemote.getFile(path);
      return mockFile ? { content: mockFile.content, sha: mockFile.sha } : null;
    }
    const appId = path.split("/").pop()?.replace(".json", "") || "default";
    const result = await this.getState(appId);
    return result ? { content: JSON.stringify(result.state), sha: result.sha || "1" } : null;
  }

  // Legacy putFile fallback compatibility
  public async putFile(path: string, content: string, commitMsg: string): Promise<{ sha: string }> {
    if (this.config.mode === "MOCK") {
      const entry = await GitHubMockRemote.putFile(path, content, commitMsg);
      return { sha: entry.sha };
    }
    const appId = path.split("/").pop()?.replace(".json", "") || "default";
    const parsed = JSON.parse(content);
    const syncRes = await this.syncState(appId, parsed);
    return { sha: syncRes.sha };
  }

  public async listDirectory(directoryPath: string): Promise<RemoteFileEntry[]> {
    if (this.config.mode === "MOCK") {
      return await GitHubMockRemote.listFiles(directoryPath);
    }
    return [];
  }
}
