/**
 * Encrypted Database Client SDK (External Client Distribution)
 *
 * Communicates strictly via standard HTTPS REST API endpoints.
 * Never connects to GitHub directly, contains zero server secrets, and
 * relies entirely on cryptographically signed Project API Tokens.
 */

export interface DatabaseClientConfig {
  baseUrl: string;
  projectId?: string;
  projectToken?: string;
  userSessionToken?: string;
  fetchFn?: typeof fetch;
}

export interface ProjectItem {
  projectId: string;
  projectToken: string;
  createdAt?: string;
}

export interface RecordEnvelope<T = any> {
  recordId: string;
  data: T;
  sha: string;
}

export interface RecordMutationResult {
  success: boolean;
  recordId: string;
  sha: string;
  message: string;
}

export interface CollectionResult {
  success: boolean;
  projectId: string;
  collection: string;
  message: string;
}

export interface ListRecordsOptions {
  filterField?: string;
  filterValue?: string | number | boolean;
}

export class DatabaseApiError extends Error {
  public status: number;
  public error: string;
  public details?: any;

  constructor(status: number, error: string, message: string, details?: any) {
    super(message || error);
    this.name = "DatabaseApiError";
    this.status = status;
    this.error = error;
    this.details = details;
  }
}

export class EncryptedDatabaseClient {
  private baseUrl: string;
  private projectId?: string;
  private projectToken?: string;
  private userSessionToken?: string;
  private fetchFn: typeof fetch;

  constructor(config: DatabaseClientConfig) {
    if (!config.baseUrl) {
      throw new Error("EncryptedDatabaseClient requires a baseUrl");
    }
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.projectId = config.projectId;
    this.projectToken = config.projectToken;
    this.userSessionToken = config.userSessionToken;
    this.fetchFn = config.fetchFn || (typeof fetch !== "undefined" ? fetch.bind(globalThis) : (globalThis as any).fetch);
  }

  public setProject(projectId: string, projectToken: string) {
    this.projectId = projectId;
    this.projectToken = projectToken;
  }

  public setSessionToken(userSessionToken: string) {
    this.userSessionToken = userSessionToken;
  }

  public async checkHealth(): Promise<{ ok: boolean; status: string }> {
    return this.request<{ ok: boolean; status: string }>({
      path: "/api/health",
      method: "GET",
    });
  }

  public async createProject(projectId: string): Promise<ProjectItem> {
    if (!this.userSessionToken) {
      throw new DatabaseApiError(401, "Unauthorized", "User session token is required to create a project.");
    }
    const res = await this.request<{ success: boolean; projectId: string; projectToken: string; message: string }>({
      path: "/api/db/projects",
      method: "POST",
      token: this.userSessionToken,
      body: { projectId },
    });

    this.projectId = res.projectId;
    this.projectToken = res.projectToken;

    return {
      projectId: res.projectId,
      projectToken: res.projectToken,
    };
  }

  public async listProjects(): Promise<ProjectItem[]> {
    if (!this.userSessionToken) {
      throw new DatabaseApiError(401, "Unauthorized", "User session token is required to list projects.");
    }
    const res = await this.request<{ projects: ProjectItem[] }>({
      path: "/api/db/projects",
      method: "GET",
      token: this.userSessionToken,
    });
    return res.projects || [];
  }

  public async createCollection(collection: string): Promise<CollectionResult> {
    const projectId = this.ensureProjectId();
    const token = this.ensureProjectToken();

    return this.request<CollectionResult>({
      path: `/api/db/projects/${encodeURIComponent(projectId)}/collections`,
      method: "POST",
      token,
      body: { collection },
    });
  }

  public async listCollections(): Promise<string[]> {
    const projectId = this.ensureProjectId();
    const token = this.ensureProjectToken();

    const res = await this.request<{ collections: string[] }>({
      path: `/api/db/projects/${encodeURIComponent(projectId)}/collections`,
      method: "GET",
      token,
    });
    return res.collections || [];
  }

  public async createRecord<T = any>(
    collection: string,
    data: T,
    recordId?: string
  ): Promise<RecordMutationResult> {
    const projectId = this.ensureProjectId();
    const token = this.ensureProjectToken();

    return this.request<RecordMutationResult>({
      path: `/api/db/projects/${encodeURIComponent(projectId)}/collections/${encodeURIComponent(collection)}/records`,
      method: "POST",
      token,
      body: { recordId, data },
    });
  }

  public async getRecord<T = any>(collection: string, recordId: string): Promise<RecordEnvelope<T>> {
    const projectId = this.ensureProjectId();
    const token = this.ensureProjectToken();

    return this.request<RecordEnvelope<T>>({
      path: `/api/db/projects/${encodeURIComponent(projectId)}/collections/${encodeURIComponent(collection)}/records/${encodeURIComponent(recordId)}`,
      method: "GET",
      token,
    });
  }

  public async updateRecord<T = any>(
    collection: string,
    recordId: string,
    data: T,
    expectedSha?: string
  ): Promise<RecordMutationResult> {
    const projectId = this.ensureProjectId();
    const token = this.ensureProjectToken();

    return this.request<RecordMutationResult>({
      path: `/api/db/projects/${encodeURIComponent(projectId)}/collections/${encodeURIComponent(collection)}/records/${encodeURIComponent(recordId)}`,
      method: "PUT",
      token,
      body: { data, expectedSha },
    });
  }

  public async deleteRecord(
    collection: string,
    recordId: string,
    expectedSha?: string
  ): Promise<{ success: boolean; message: string }> {
    const projectId = this.ensureProjectId();
    const token = this.ensureProjectToken();

    return this.request<{ success: boolean; message: string }>({
      path: `/api/db/projects/${encodeURIComponent(projectId)}/collections/${encodeURIComponent(collection)}/records/${encodeURIComponent(recordId)}`,
      method: "DELETE",
      token,
      body: expectedSha ? { expectedSha } : undefined,
    });
  }

  public async listRecords<T = any>(
    collection: string,
    options?: ListRecordsOptions
  ): Promise<RecordEnvelope<T>[]> {
    const projectId = this.ensureProjectId();
    const token = this.ensureProjectToken();

    let query = "";
    if (options?.filterField && options?.filterValue !== undefined) {
      const params = new URLSearchParams();
      params.set("filterField", options.filterField);
      params.set("filterValue", String(options.filterValue));
      query = `?${params.toString()}`;
    }

    const res = await this.request<{ records: RecordEnvelope<T>[] }>({
      path: `/api/db/projects/${encodeURIComponent(projectId)}/collections/${encodeURIComponent(collection)}/records${query}`,
      method: "GET",
      token,
    });

    return res.records || [];
  }

  private async request<T>(opts: {
    path: string;
    method: "GET" | "POST" | "PUT" | "DELETE";
    token?: string;
    body?: any;
  }): Promise<T> {
    const url = `${this.baseUrl}${opts.path}`;
    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (opts.token) {
      headers["Authorization"] = `Bearer ${opts.token}`;
    }

    let bodyStr: string | undefined = undefined;
    if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      bodyStr = JSON.stringify(opts.body);
    }

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: opts.method,
        headers,
        body: bodyStr,
      });
    } catch (err: any) {
      throw new DatabaseApiError(0, "NetworkError", `Network request failed: ${err.message}`, err);
    }

    let json: any = null;
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        json = await response.json();
      } catch {
        // ignore json parse error
      }
    }

    if (!response.ok) {
      const errorCategory = json?.error || `HTTP ${response.status}`;
      const errorMessage = json?.message || response.statusText || "Database request failed";
      throw new DatabaseApiError(response.status, errorCategory, errorMessage, json);
    }

    return json as T;
  }

  private ensureProjectId(): string {
    if (!this.projectId) {
      throw new Error("projectId is required for this operation. Select or create a project first.");
    }
    return this.projectId;
  }

  private ensureProjectToken(): string {
    if (!this.projectToken) {
      throw new Error("projectToken is required for this operation. Provide a valid Project Token.");
    }
    return this.projectToken;
  }
}
