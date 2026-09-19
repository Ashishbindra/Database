import { CentralDataClient } from "../CentralDataClient";
import { CryptoManager } from "../crypto/CryptoManager";
import { GitHubMockRemote } from "./GitHubMockRemote";

function getApiUrl(endpoint: string): string {
  if (endpoint.startsWith("http://") || endpoint.startsWith("https://")) return endpoint;
  if (typeof window !== "undefined" && window.location && window.location.origin) {
    return `${window.location.origin}${endpoint}`;
  }
  return `http://localhost:3000${endpoint}`;
}

export class EncryptedVaultSDK {
  private client: CentralDataClient;

  constructor(client: CentralDataClient) {
    this.client = client;
  }

  private resolvePath(key: string, userId: string): string {
    const prefix = `data/users/${userId}/`;
    if (key.startsWith(prefix)) {
      return key;
    }
    const cleanKey = key.replace(/^\/+/, "");
    return `${prefix}${cleanKey}`;
  }

  public async set(key: string, value: any): Promise<{ sha: string }> {
    if (!this.client.authManager.isLoggedIn()) {
      throw new Error("Unauthorized: Active session required to set vault data.");
    }
    const userId = this.client.keyManager.getActiveUserId();
    const dek = this.client.keyManager.getActiveDek();
    const resolvedPath = this.resolvePath(key, userId);

    // Encrypt client-side using existing CryptoManager
    const envelope = await CryptoManager.encryptData(value, dek, "vault", userId);
    const content = JSON.stringify(envelope, null, 2);

    if (this.client.githubClient.getConfig().mode === "MOCK") {
      const entry = await GitHubMockRemote.putFile(resolvedPath, content, `Set vault key: ${key}`);
      return { sha: entry.sha };
    }

    const token = this.client.authManager.getSessionToken();
    const res = await fetch(getApiUrl("/api/vault/file"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        path: resolvedPath,
        content,
      }),
    });

    if (res.status === 409) {
      throw { status: 409, message: "Storage conflict: Remote file changed. Refresh and try again." };
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `HTTP Error ${res.status}`);
    }

    const data = await res.json();
    return { sha: data.sha };
  }

  public async get(key: string): Promise<any> {
    if (!this.client.authManager.isLoggedIn()) {
      throw new Error("Unauthorized: Active session required to get vault data.");
    }
    const userId = this.client.keyManager.getActiveUserId();
    const dek = this.client.keyManager.getActiveDek();
    const resolvedPath = this.resolvePath(key, userId);

    let content: string | null = null;
    let sha: string | null = null;

    if (this.client.githubClient.getConfig().mode === "MOCK") {
      const mockFile = await GitHubMockRemote.getFile(resolvedPath);
      if (mockFile) {
        content = mockFile.content;
        sha = mockFile.sha;
      }
    } else {
      const token = this.client.authManager.getSessionToken();
      const res = await fetch(getApiUrl(`/api/vault/file?path=${encodeURIComponent(resolvedPath)}`), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        content = data.content;
        sha = data.sha;
      }
    }

    if (!content) return null;

    // Decrypt client-side using existing CryptoManager
    try {
      const envelope = JSON.parse(content);
      const decrypted = await CryptoManager.decryptData<any>(envelope, dek, "vault", userId);
      return decrypted.payload;
    } catch (err: any) {
      console.error("Failed to decrypt vault content:", err);
      return null;
    }
  }

  public async update(key: string, value: any, expectedSha?: string): Promise<{ sha: string }> {
    if (!this.client.authManager.isLoggedIn()) {
      throw new Error("Unauthorized: Active session required to update vault data.");
    }
    const userId = this.client.keyManager.getActiveUserId();
    const dek = this.client.keyManager.getActiveDek();
    const resolvedPath = this.resolvePath(key, userId);

    // Encrypt client-side using existing CryptoManager
    const envelope = await CryptoManager.encryptData(value, dek, "vault", userId);
    const content = JSON.stringify(envelope, null, 2);

    if (this.client.githubClient.getConfig().mode === "MOCK") {
      if (expectedSha !== undefined) {
        const existing = await GitHubMockRemote.getFile(resolvedPath);
        if (existing && existing.sha !== expectedSha) {
          throw { status: 409, message: "Storage conflict: Remote version updated concurrently." };
        }
      }
      const entry = await GitHubMockRemote.putFile(resolvedPath, content, `Update vault key: ${key}`);
      return { sha: entry.sha };
    }

    const token = this.client.authManager.getSessionToken();
    const res = await fetch(getApiUrl("/api/vault/file"), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        path: resolvedPath,
        content,
        expectedSha,
      }),
    });

    if (res.status === 409) {
      throw { status: 409, message: "Storage conflict: Remote file changed. Refresh and try again." };
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `HTTP Error ${res.status}`);
    }

    const data = await res.json();
    return { sha: data.sha };
  }

  public async delete(key: string, expectedSha?: string): Promise<void> {
    if (!this.client.authManager.isLoggedIn()) {
      throw new Error("Unauthorized: Active session required to delete vault data.");
    }
    const userId = this.client.keyManager.getActiveUserId();
    const resolvedPath = this.resolvePath(key, userId);

    // For safe delete, we need SHA. If not provided, fetch first
    let shaToDelete = expectedSha;
    if (!shaToDelete) {
      if (this.client.githubClient.getConfig().mode === "MOCK") {
        const file = await GitHubMockRemote.getFile(resolvedPath);
        if (file) shaToDelete = file.sha;
      } else {
        const token = this.client.authManager.getSessionToken();
        const res = await fetch(getApiUrl(`/api/vault/file?path=${encodeURIComponent(resolvedPath)}`), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (res.ok) {
          const data = await res.json();
          shaToDelete = data.sha;
        }
      }
    }

    if (!shaToDelete) {
      throw new Error("Delete Error: File not found or SHA missing.");
    }

    if (this.client.githubClient.getConfig().mode === "MOCK") {
      const existing = await GitHubMockRemote.getFile(resolvedPath);
      if (existing && existing.sha !== shaToDelete) {
        throw { status: 409, message: "Storage conflict: Remote version updated concurrently." };
      }
      await GitHubMockRemote.deleteFile(resolvedPath);
      return;
    }

    const token = this.client.authManager.getSessionToken();
    const res = await fetch(getApiUrl(`/api/vault/file`), {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        path: resolvedPath,
        sha: shaToDelete,
      }),
    });

    if (res.status === 409) {
      throw { status: 409, message: "Storage conflict: Remote file changed. Refresh and try again." };
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `HTTP Error ${res.status}`);
    }
  }

  public async list(): Promise<string[]> {
    if (!this.client.authManager.isLoggedIn()) {
      return [];
    }
    const userId = this.client.keyManager.getActiveUserId();
    const prefix = `data/users/${userId}/`;

    let allFiles: any[] = [];
    if (this.client.githubClient.getConfig().mode === "MOCK") {
      const mockFiles = GitHubMockRemote.getAllVirtualFiles();
      allFiles = Object.keys(mockFiles).map((p) => ({ path: p }));
    } else {
      allFiles = await this.client.githubClient.listDirectory("");
    }

    return allFiles
      .filter((f) => f.path.startsWith(prefix))
      .map((f) => f.path.substring(prefix.length));
  }

  public async exists(key: string): Promise<boolean> {
    if (!this.client.authManager.isLoggedIn()) {
      return false;
    }
    const userId = this.client.keyManager.getActiveUserId();
    const resolvedPath = this.resolvePath(key, userId);

    if (this.client.githubClient.getConfig().mode === "MOCK") {
      const file = await GitHubMockRemote.getFile(resolvedPath);
      return !!file;
    } else {
      const token = this.client.authManager.getSessionToken();
      const res = await fetch(getApiUrl(`/api/vault/file?path=${encodeURIComponent(resolvedPath)}`), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return res.ok;
    }
  }
}
