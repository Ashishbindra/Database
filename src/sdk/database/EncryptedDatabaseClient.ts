/**
 * Lightweight, HTTP-only Client SDK for the Encrypted Multi-Project Database Service.
 *
 * This client communicates strictly over standard HTTP/HTTPS REST endpoints and
 * does not import any server code, server-side encryption secrets, or GitHub credentials.
 */

export interface DatabaseClientConfig {
  /** Base URL of the database server (e.g., "https://api.example.com" or "http://localhost:3000") */
  baseUrl: string;
  /** Active Project ID (e.g. "my_app") */
  projectId?: string;
  /** Cryptographically signed Project API Token */
  projectToken?: string;
  /** User administrative session token (for creating/listing projects) */
  userSessionToken?: string;
  /** Custom fetch implementation (optional, defaults to global fetch) */
  fetchFn?: typeof fetch;
}

export interface CreateProjectOptions {
  baseUrl: string;
  userSessionToken: string;
  projectId: string;
  fetchFn?: typeof fetch;
}

export interface ListProjectsOptions {
  baseUrl: string;
  userSessionToken: string;
  fetchFn?: typeof fetch;
}

export interface ProjectItem {
  projectId: string;
  projectToken: string;
  status?: "active" | "disabled";
  createdAt?: string;
  updatedAt?: string;
}

export interface RawRecordEnvelope {
  recordId: string;
  rawPersistedContent: string;
  sha: string;
  isEncrypted: boolean;
}

export interface RecordEnvelope<T = any> {
  recordId: string;
  data: T;
  sha: string;
  updatedAt?: string;
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

export interface DatabaseUsageTelemetry {
  success: boolean;
  totalProjects: number;
  activeProjects: number;
  disabledProjects: number;
  totalCollections: number;
  totalRecords: number;
  projects: Array<{
    projectId: string;
    status: string;
    collectionsCount: number;
    recordsCount: number;
    lastUsedAt: string | null;
    createdAt: string | null;
  }>;
  storage: {
    provider: string;
    owner: string;
    repo: string;
    branch: string;
    isConfigured: boolean;
  };
  security: {
    encryption: string;
    keyDerivation: string;
    concurrency: string;
    projectIsolation: string;
  };
  rateLimit?: {
    standardLimit: number;
    windowMs: number;
  };
}

export interface ProjectStatsResult {
  success: boolean;
  projectId: string;
  collectionsCount: number;
  totalRecords: number;
  collections: Array<{ collection: string; recordCount: number }>;
  collectionsBreakdown?: Record<string, number>;
  lastUsedAt: string;
}

/**
 * Standardized Database API Error containing HTTP status codes and error categories.
 */
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

  public get statusCode(): number {
    return this.status;
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
    if (config.fetchFn) {
      this.fetchFn = config.fetchFn;
    } else if (typeof window !== "undefined" && typeof window.fetch === "function") {
      this.fetchFn = window.fetch.bind(window);
    } else if (typeof globalThis !== "undefined" && typeof globalThis.fetch === "function") {
      this.fetchFn = globalThis.fetch.bind(globalThis);
    } else if (typeof fetch === "function") {
      this.fetchFn = fetch;
    } else {
      this.fetchFn = ((globalThis as any)?.fetch?.bind(globalThis)) || fetch;
    }
  }

  public setProject(projectId: string, projectToken?: string) {
    this.projectId = projectId;
    this.projectToken = projectToken;
  }

  public setSessionToken(userSessionToken: string) {
    this.userSessionToken = userSessionToken;
  }

  // ==========================================
  // STATIC HELPERS FOR PROJECT MANAGEMENT
  // ==========================================

  /**
   * Static helper: Create a new project and retrieve its projectToken using a user session token.
   */
  public static async createProject(options: CreateProjectOptions): Promise<ProjectItem> {
    const client = new EncryptedDatabaseClient({
      baseUrl: options.baseUrl,
      userSessionToken: options.userSessionToken,
      fetchFn: options.fetchFn,
    });
    return client.createProject(options.projectId);
  }

  /**
   * Static helper: List all projects owned by the user.
   */
  public static async listProjects(options: ListProjectsOptions): Promise<ProjectItem[]> {
    const client = new EncryptedDatabaseClient({
      baseUrl: options.baseUrl,
      userSessionToken: options.userSessionToken,
      fetchFn: options.fetchFn,
    });
    return client.listProjects();
  }

  // ==========================================
  // INSTANCE PROJECT MANAGEMENT
  // ==========================================

  /**
   * Creates a new database project and returns its projectId and projectToken.
   */
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

    // If no active projectId/token was set, automatically adopt the newly created project
    if (!this.projectId) this.projectId = res.projectId;
    if (!this.projectToken) this.projectToken = res.projectToken;

    return {
      projectId: res.projectId,
      projectToken: res.projectToken,
    };
  }

  /**
   * Lists all projects belonging to the authenticated user.
   */
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

  /**
   * Updates project status (e.g. "active" or "disabled").
   */
  public async updateProjectStatus(projectId: string, status: "active" | "disabled"): Promise<{ success: boolean; projectId: string; status: string; message: string }> {
    if (!this.userSessionToken) {
      throw new DatabaseApiError(401, "Unauthorized", "User session token is required to update project status.");
    }
    return this.request<{ success: boolean; projectId: string; status: string; message: string }>({
      path: `/api/db/projects/${encodeURIComponent(projectId)}/status`,
      method: "PATCH",
      token: this.userSessionToken,
      body: { status },
    });
  }

  /**
   * Rotates a project's API token.
   */
  public async rotateProjectToken(projectId: string): Promise<{ success: boolean; projectId: string; projectToken: string; message: string }> {
    if (!this.userSessionToken) {
      throw new DatabaseApiError(401, "Unauthorized", "User session token is required to rotate project token.");
    }
    const res = await this.request<{ success: boolean; projectId: string; projectToken: string; message: string }>({
      path: `/api/db/projects/${encodeURIComponent(projectId)}/token/rotate`,
      method: "POST",
      token: this.userSessionToken,
    });
    if (this.projectId === projectId) {
      this.projectToken = res.projectToken;
    }
    return res;
  }

  /**
   * Revokes a project's API token and disables the project.
   */
  public async revokeProjectToken(projectId: string): Promise<{ success: boolean; projectId: string; message: string }> {
    if (!this.userSessionToken) {
      throw new DatabaseApiError(401, "Unauthorized", "User session token is required to revoke project token.");
    }
    const res = await this.request<{ success: boolean; projectId: string; message: string }>({
      path: `/api/db/projects/${encodeURIComponent(projectId)}/token/revoke`,
      method: "POST",
      token: this.userSessionToken,
    });
    if (this.projectId === projectId) {
      this.projectToken = undefined;
    }
    return res;
  }

  /**
   * Deletes a project and all its associated encrypted collections.
   */
  public async deleteProject(projectId: string): Promise<{ success: boolean; projectId: string; message: string }> {
    if (!this.userSessionToken) {
      throw new DatabaseApiError(401, "Unauthorized", "User session token is required to delete a project.");
    }
    const res = await this.request<{ success: boolean; projectId: string; message: string }>({
      path: `/api/db/projects/${encodeURIComponent(projectId)}`,
      method: "DELETE",
      token: this.userSessionToken,
    });
    if (this.projectId === projectId) {
      this.projectId = undefined;
      this.projectToken = undefined;
    }
    return res;
  }

  /**
   * Retrieves developer usage telemetry across all projects.
   */
  public async getUsage(): Promise<DatabaseUsageTelemetry> {
    if (!this.userSessionToken) {
      throw new DatabaseApiError(401, "Unauthorized", "User session token is required to get usage telemetry.");
    }
    return this.request<DatabaseUsageTelemetry>({
      path: "/api/db/usage",
      method: "GET",
      token: this.userSessionToken,
    });
  }

  /**
   * Retrieves collection breakdown and record statistics for a project.
   */
  public async getProjectStats(projectId?: string): Promise<ProjectStatsResult> {
    const targetProjectId = projectId || this.ensureProjectId();
    const token = this.projectToken || this.userSessionToken;
    if (!token) {
      throw new DatabaseApiError(401, "Unauthorized", "Project token or user session token is required.");
    }
    return this.request<ProjectStatsResult>({
      path: `/api/db/projects/${encodeURIComponent(targetProjectId)}/stats`,
      method: "GET",
      token,
    });
  }

  // ==========================================
  // COLLECTION MANAGEMENT
  // ==========================================

  /**
   * Creates a new collection in the active project.
   */
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

  /**
   * Deletes a collection and all its stored records in the active project.
   */
  public async deleteCollection(collection: string): Promise<{ success: boolean; projectId: string; collection: string; message: string }> {
    const projectId = this.ensureProjectId();
    const token = this.ensureProjectToken();

    return this.request<{ success: boolean; projectId: string; collection: string; message: string }>({
      path: `/api/db/projects/${encodeURIComponent(projectId)}/collections/${encodeURIComponent(collection)}`,
      method: "DELETE",
      token,
    });
  }

  /**
   * Lists all collections in the active project.
   */
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

  // ==========================================
  // RECORD CRUD OPERATIONS
  // ==========================================

  /**
   * Inserts a new record into a collection.
   * If `recordId` is omitted, the server generates a secure random ID.
   */
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

  /**
   * Alias for createRecord.
   */
  public async insertRecord<T = any>(
    collection: string,
    data: T,
    recordId?: string
  ): Promise<RecordMutationResult> {
    return this.createRecord<T>(collection, data, recordId);
  }

  /**
   * Retrieves a single decrypted record by ID.
   */
  public async getRecord<T = any>(collection: string, recordId: string): Promise<RecordEnvelope<T>> {
    const projectId = this.ensureProjectId();
    const token = this.ensureProjectToken();

    return this.request<RecordEnvelope<T>>({
      path: `/api/db/projects/${encodeURIComponent(projectId)}/collections/${encodeURIComponent(collection)}/records/${encodeURIComponent(recordId)}`,
      method: "GET",
      token,
    });
  }

  /**
   * Retrieves the raw AES-256-GCM encrypted envelope (iv, ciphertext, tag) as persisted on GitHub.
   */
  public async getRawRecordEnvelope(collection: string, recordId: string): Promise<RawRecordEnvelope> {
    const projectId = this.ensureProjectId();
    const token = this.ensureProjectToken();

    return this.request<RawRecordEnvelope>({
      path: `/api/db/projects/${encodeURIComponent(projectId)}/collections/${encodeURIComponent(collection)}/records/${encodeURIComponent(recordId)}/raw`,
      method: "GET",
      token,
    });
  }

  /**
   * Alias for getRawRecordEnvelope.
   */
  public async getRawEnvelope(collection: string, recordId: string): Promise<RawRecordEnvelope> {
    return this.getRawRecordEnvelope(collection, recordId);
  }

  /**
   * Alias for getProjectStats.
   */
  public async getStats(projectId?: string): Promise<ProjectStatsResult> {
    return this.getProjectStats(projectId);
  }

  /**
   * Updates an existing record with optional optimistic concurrency SHA verification.
   */
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

  /**
   * Deletes a record with optional optimistic concurrency SHA verification.
   */
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

  /**
   * Lists records in a collection, with optional server-side field filtering.
   */
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

  /**
   * Lists records with client/server-side pagination support.
   */
  public async listRecordsPaginated<T = any>(
    collection: string,
    options?: { page?: number; limit?: number; filterField?: string; filterValue?: string }
  ): Promise<{ records: RecordEnvelope<T>[]; total: number; page: number; limit: number; totalPages: number }> {
    const page = Math.max(1, options?.page || 1);
    const limit = Math.max(1, options?.limit || 20);
    const allRecords = await this.listRecords<T>(collection, {
      filterField: options?.filterField,
      filterValue: options?.filterValue,
    });

    const total = allRecords.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const offset = (page - 1) * limit;
    const records = allRecords.slice(offset, offset + limit);

    return {
      records,
      total,
      page,
      limit,
      totalPages,
    };
  }

  /**
   * Checks the health and operational status of the database API service.
   */
  public async checkHealth(): Promise<{ status: string; uptime?: number; timestamp: string }> {
    return this.request<{ status: string; uptime?: number; timestamp: string }>({
      path: "/api/health",
      method: "GET",
    });
  }

  // ==========================================
  // INTERNAL HTTP HANDLER
  // ==========================================

  private async request<T>(opts: {
    path: string;
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
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
      const fetchImpl = this.fetchFn || (
        typeof window !== "undefined" && typeof window.fetch === "function"
          ? window.fetch.bind(window)
          : (typeof globalThis !== "undefined" && typeof globalThis.fetch === "function"
              ? globalThis.fetch.bind(globalThis)
              : fetch)
      );
      const targetContext = typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : undefined);
      response = await fetchImpl.call(targetContext, url, {
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
      throw new Error("projectId is required for this operation. Configure it in EncryptedDatabaseClient or call createProject().");
    }
    return this.projectId;
  }

  private ensureProjectToken(): string {
    if (!this.projectToken) {
      throw new Error("projectToken is required for this operation. Configure it in EncryptedDatabaseClient.");
    }
    return this.projectToken;
  }
}
