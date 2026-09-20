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
    this.fetchFn = config.fetchFn || (typeof fetch !== "undefined" ? fetch : (globalThis as any).fetch);
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

  // ==========================================
  // INTERNAL HTTP HANDLER
  // ==========================================

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
