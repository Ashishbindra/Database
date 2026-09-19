/**
 * GitHubMockRemote - Virtual GitHub Repository Simulator
 * Enables 100% offline testing of remote GitHub storage, file commit trees,
 * multi-device recovery, and uninstall/reinstall scenarios.
 */

import { RemoteFileEntry } from "../types";

export class GitHubMockRemote {
  private static STORAGE_KEY = "GithubEncryptedSDK_VirtualRemoteRepo";
  private static inMemoryStore: Record<string, RemoteFileEntry> = {};

  private static get cryptoObj(): Crypto {
    if (typeof globalThis !== "undefined" && globalThis.crypto) {
      return globalThis.crypto as Crypto;
    }
    if (typeof window !== "undefined" && window.crypto) {
      return window.crypto;
    }
    throw new Error("Crypto API unavailable");
  }

  private static loadFiles(): Record<string, RemoteFileEntry> {
    try {
      if (typeof localStorage !== "undefined") {
        const stored = localStorage.getItem(this.STORAGE_KEY);
        return stored ? JSON.parse(stored) : {};
      }
    } catch {}
    return { ...this.inMemoryStore };
  }

  private static saveFiles(files: Record<string, RemoteFileEntry>) {
    this.inMemoryStore = { ...files };
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(files));
      }
    } catch (e) {
      console.warn("Virtual GitHub Storage full", e);
    }
  }

  public static async getFile(path: string): Promise<RemoteFileEntry | null> {
    // Simulate GitHub REST API network latency
    await new Promise((r) => setTimeout(r, 10));
    const files = this.loadFiles();
    return files[path] || null;
  }

  public static async putFile(path: string, content: string, message = "Update file"): Promise<RemoteFileEntry> {
    await new Promise((r) => setTimeout(r, 10));
    const files = this.loadFiles();

    // Generate SHA hash mock
    const shaBuffer = await this.cryptoObj.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(content + Date.now())
    );
    const sha = Array.from(new Uint8Array(shaBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .substring(0, 12);

    const entry: RemoteFileEntry = {
      path,
      sha,
      content,
      updatedAt: new Date().toISOString(),
    };

    files[path] = entry;
    this.saveFiles(files);
    return entry;
  }

  public static async listFiles(directoryPrefix: string): Promise<RemoteFileEntry[]> {
    await new Promise((r) => setTimeout(r, 10));
    const files = this.loadFiles();
    return Object.values(files).filter((f) => f.path.startsWith(directoryPrefix));
  }

  public static async deleteFile(path: string): Promise<boolean> {
    await new Promise((r) => setTimeout(r, 10));
    const files = this.loadFiles();
    if (files[path]) {
      delete files[path];
      this.saveFiles(files);
      return true;
    }
    return false;
  }

  public static async clearVirtualRemote(): Promise<void> {
    this.inMemoryStore = {};
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(this.STORAGE_KEY);
      }
    } catch {}
  }

  public static getAllVirtualFiles(): Record<string, RemoteFileEntry> {
    return this.loadFiles();
  }
}
