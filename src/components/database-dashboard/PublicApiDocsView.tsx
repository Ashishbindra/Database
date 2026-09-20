import React, { useState } from "react";
import { ProjectItem } from "../../sdk/database/EncryptedDatabaseClient";
import { 
  BookOpen, 
  Copy, 
  Check, 
  Terminal, 
  Code2, 
  ShieldCheck, 
  Lock, 
  Layers, 
  Key, 
  Database, 
  ArrowRight, 
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  FileCode,
  Sparkles,
  GitBranch,
  RefreshCw,
  Search
} from "lucide-react";

interface PublicApiDocsViewProps {
  activeProject?: ProjectItem | null;
  onNavigateToProjects?: () => void;
  onNavigateToExplorer?: () => void;
  onNavigateToPlayground?: () => void;
}

type DocSection = 
  | "overview" 
  | "quickstart" 
  | "authentication" 
  | "projects" 
  | "collections" 
  | "records" 
  | "filtering" 
  | "concurrency" 
  | "errors" 
  | "sdk" 
  | "security";

export function PublicApiDocsView({
  activeProject,
  onNavigateToProjects,
  onNavigateToExplorer,
  onNavigateToPlayground,
}: PublicApiDocsViewProps) {
  const [activeSection, setActiveSection] = useState<DocSection>("overview");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeLang, setActiveLang] = useState<"curl" | "ts" | "python">("curl");
  const [searchDocQuery, setSearchDocQuery] = useState("");

  const origin = typeof window !== "undefined" ? window.location.origin : "https://github-encrypted-vault.vercel.app";
  const projectId = activeProject?.projectId || "my-app";
  const projectToken = activeProject?.projectToken || "PROJECT_API_TOKEN";

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const navItems: { id: DocSection; label: string; path: string }[] = [
    { id: "overview", label: "Overview & Base URL", path: "/docs" },
    { id: "quickstart", label: "5-Min Quick Start", path: "/docs/quickstart" },
    { id: "authentication", label: "Authentication & HMAC", path: "/docs/authentication" },
    { id: "projects", label: "Project Management", path: "/docs/projects" },
    { id: "collections", label: "Collections", path: "/docs/collections" },
    { id: "records", label: "Record CRUD & Envelopes", path: "/docs/records" },
    { id: "filtering", label: "Field Filtering", path: "/docs/filtering" },
    { id: "concurrency", label: "Optimistic Concurrency", path: "/docs/concurrency" },
    { id: "errors", label: "HTTP Error Codes", path: "/docs/errors" },
    { id: "sdk", label: "Developer SDK Reference", path: "/docs/sdk" },
    { id: "security", label: "Cryptographic Security Model", path: "/docs/security" },
  ];

  const filteredNavItems = navItems.filter((item) =>
    item.label.toLowerCase().includes(searchDocQuery.toLowerCase()) ||
    item.path.toLowerCase().includes(searchDocQuery.toLowerCase())
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Docs Sidebar Navigation */}
      <div className="lg:col-span-3 space-y-4">
        <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-4 space-y-3 sticky top-6">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-semibold text-stone-200 uppercase font-mono tracking-wider">
              API Documentation
            </h3>
          </div>

          <div className="relative">
            <Search className="w-3 h-3 text-stone-500 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search docs (/docs/...)"
              value={searchDocQuery}
              onChange={(e) => setSearchDocQuery(e.target.value)}
              className="w-full bg-stone-950 border border-stone-800 rounded-xl pl-8 pr-2.5 py-1.5 text-xs text-stone-300 placeholder-stone-600 focus:outline-none focus:border-amber-500/80 font-mono"
            />
          </div>

          <nav className="space-y-1">
            {filteredNavItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs font-mono transition flex items-center justify-between ${
                  activeSection === item.id
                    ? "bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold"
                    : "text-stone-400 hover:text-stone-200 hover:bg-stone-800/60"
                }`}
              >
                <span>{item.label}</span>
                <span className="text-[10px] text-stone-500 opacity-60 font-mono">{item.path}</span>
              </button>
            ))}
          </nav>

          {onNavigateToPlayground && (
            <div className="pt-2 border-t border-stone-800">
              <button
                onClick={onNavigateToPlayground}
                className="w-full py-2 bg-stone-800 hover:bg-stone-700 text-amber-300 text-xs font-mono rounded-xl flex items-center justify-center gap-1.5 transition"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Open API Playground</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Docs Main Content Panel */}
      <div className="lg:col-span-9 space-y-6">
        {/* Language Switcher Bar */}
        <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-stone-400">Code Examples:</span>
            <div className="flex items-center gap-1 bg-stone-950 p-0.5 rounded-lg border border-stone-800">
              <button
                onClick={() => setActiveLang("curl")}
                className={`px-3 py-1 text-xs font-mono rounded ${
                  activeLang === "curl" ? "bg-stone-800 text-amber-300 font-bold" : "text-stone-400 hover:text-stone-200"
                }`}
              >
                cURL
              </button>
              <button
                onClick={() => setActiveLang("ts")}
                className={`px-3 py-1 text-xs font-mono rounded ${
                  activeLang === "ts" ? "bg-stone-800 text-amber-300 font-bold" : "text-stone-400 hover:text-stone-200"
                }`}
              >
                TypeScript / JS
              </button>
              <button
                onClick={() => setActiveLang("python")}
                className={`px-3 py-1 text-xs font-mono rounded ${
                  activeLang === "python" ? "bg-stone-800 text-amber-300 font-bold" : "text-stone-400 hover:text-stone-200"
                }`}
              >
                Python
              </button>
            </div>
          </div>

          <div className="text-xs font-mono text-stone-400 hidden sm:block">
            Namespace: <span className="text-amber-300 font-semibold">{projectId}</span>
          </div>
        </div>

        {/* SECTION: OVERVIEW */}
        {activeSection === "overview" && (
          <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl">
            <div className="space-y-2">
              <span className="text-[11px] font-mono uppercase text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full">
                /docs
              </span>
              <h2 className="text-xl font-bold text-stone-100">Production REST API Base URL & Architecture</h2>
              <p className="text-sm text-stone-400 leading-relaxed">
                The GitHub Encrypted Vault provides a multi-tenant, cloud-persisted JSON database engine backed directly by GitHub Git trees. Every record is encrypted server-side with AES-256-GCM before writing to repository storage, eliminating recurring database server hosting fees.
              </p>
            </div>

            <div className="bg-stone-950 border border-stone-800 rounded-xl p-4 flex items-center justify-between">
              <div className="space-y-1">
                <div className="text-[10px] font-mono text-stone-500 uppercase">Production Base URL</div>
                <div className="font-mono text-sm text-emerald-400">{origin}</div>
              </div>
              <button
                onClick={() => handleCopy(origin, "base_url")}
                className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs rounded-xl font-mono flex items-center gap-1.5 transition"
              >
                {copiedKey === "base_url" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>Copy URL</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="bg-stone-950/60 border border-stone-800 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-amber-400 font-mono text-xs font-semibold">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Zero PAT Exposure</span>
                </div>
                <p className="text-xs text-stone-400">
                  GitHub Personal Access Tokens are strictly server-side. Clients use scoped HMAC-SHA256 project tokens.
                </p>
              </div>

              <div className="bg-stone-950/60 border border-stone-800 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 font-mono text-xs font-semibold">
                  <Lock className="w-4 h-4" />
                  <span>AES-256-GCM</span>
                </div>
                <p className="text-xs text-stone-400">
                  Each record payload is encrypted with authenticated cipher envelopes containing iv, ciphertext, and tag.
                </p>
              </div>

              <div className="bg-stone-950/60 border border-stone-800 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-sky-400 font-mono text-xs font-semibold">
                  <GitBranch className="w-4 h-4" />
                  <span>Optimistic Locks</span>
                </div>
                <p className="text-xs text-stone-400">
                  Built-in <code className="text-stone-300 font-mono">expectedSha</code> prevents race conditions and lost updates with HTTP 409 rejections.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* SECTION: QUICK START */}
        {activeSection === "quickstart" && (
          <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl">
            <div className="space-y-2">
              <span className="text-[11px] font-mono uppercase text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full">
                /docs/quickstart
              </span>
              <h2 className="text-xl font-bold text-stone-100">5-Minute Integration Quick Start</h2>
              <p className="text-sm text-stone-400">
                Follow these 4 simple steps to connect and read/write encrypted records from any client.
              </p>
            </div>

            {/* Step 1 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 font-mono text-xs font-semibold text-stone-200">
                <span className="w-5 h-5 rounded-full bg-amber-500 text-stone-950 flex items-center justify-center text-[11px]">1</span>
                <span>Create a Collection</span>
              </div>
              <div className="bg-stone-950 border border-stone-800 rounded-xl p-4 font-mono text-xs text-stone-300 overflow-x-auto">
                <pre>{activeLang === "curl" ? `curl -X POST "${origin}/api/db/projects/${projectId}/collections" \\
  -H "Authorization: Bearer ${projectToken}" \\
  -H "Content-Type: application/json" \\
  -d '{"collection": "customers"}'` : activeLang === "ts" ? `await fetch("${origin}/api/db/projects/${projectId}/collections", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${projectToken}",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ collection: "customers" })
});` : `import requests

res = requests.post(
    "${origin}/api/db/projects/${projectId}/collections",
    headers={"Authorization": "Bearer ${projectToken}"},
    json={"collection": "customers"}
)
print(res.json())`}</pre>
              </div>
            </div>

            {/* Step 2 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 font-mono text-xs font-semibold text-stone-200">
                <span className="w-5 h-5 rounded-full bg-amber-500 text-stone-950 flex items-center justify-center text-[11px]">2</span>
                <span>Insert an Encrypted Record</span>
              </div>
              <div className="bg-stone-950 border border-stone-800 rounded-xl p-4 font-mono text-xs text-stone-300 overflow-x-auto">
                <pre>{activeLang === "curl" ? `curl -X POST "${origin}/api/db/projects/${projectId}/collections/customers/records" \\
  -H "Authorization: Bearer ${projectToken}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "recordId": "cust_001",
    "data": {
      "name": "Jane Doe",
      "email": "jane@example.com",
      "plan": "developer"
    }
  }'` : activeLang === "ts" ? `const res = await fetch("${origin}/api/db/projects/${projectId}/collections/customers/records", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${projectToken}",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    recordId: "cust_001",
    data: { name: "Jane Doe", email: "jane@example.com", plan: "developer" }
  })
});
const { sha } = await res.json();` : `res = requests.post(
    "${origin}/api/db/projects/${projectId}/collections/customers/records",
    headers={"Authorization": "Bearer ${projectToken}"},
    json={
        "recordId": "cust_001",
        "data": {"name": "Jane Doe", "email": "jane@example.com", "plan": "developer"}
    }
)
sha = res.json()["sha"]`}</pre>
              </div>
            </div>

            {/* Step 3 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 font-mono text-xs font-semibold text-stone-200">
                <span className="w-5 h-5 rounded-full bg-amber-500 text-stone-950 flex items-center justify-center text-[11px]">3</span>
                <span>Read & Filter Records</span>
              </div>
              <div className="bg-stone-950 border border-stone-800 rounded-xl p-4 font-mono text-xs text-stone-300 overflow-x-auto">
                <pre>{activeLang === "curl" ? `curl -X GET "${origin}/api/db/projects/${projectId}/collections/customers/records?filterField=plan&filterValue=developer" \\
  -H "Authorization: Bearer ${projectToken}"` : activeLang === "ts" ? `const res = await fetch("${origin}/api/db/projects/${projectId}/collections/customers/records?filterField=plan&filterValue=developer", {
  headers: { "Authorization": "Bearer ${projectToken}" }
});
const { records } = await res.json();` : `res = requests.get(
    "${origin}/api/db/projects/${projectId}/collections/customers/records",
    headers={"Authorization": "Bearer ${projectToken}"},
    params={"filterField": "plan", "filterValue": "developer"}
)
records = res.json()["records"]`}</pre>
              </div>
            </div>
          </div>
        )}

        {/* SECTION: AUTHENTICATION */}
        {activeSection === "authentication" && (
          <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl">
            <div className="space-y-2">
              <span className="text-[11px] font-mono uppercase text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full">
                /docs/authentication
              </span>
              <h2 className="text-xl font-bold text-stone-100">Authentication & HMAC Project Tokens</h2>
              <p className="text-sm text-stone-400">
                All requests to project database endpoints are authenticated using scoped HMAC-SHA256 bearer tokens.
              </p>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-mono font-semibold text-stone-200 uppercase">HTTP Header Format</h4>
              <div className="bg-stone-950 border border-stone-800 rounded-xl p-4 font-mono text-xs text-amber-300">
                Authorization: Bearer &lt;PROJECT_API_TOKEN&gt;
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-mono font-semibold text-stone-200 uppercase">Token Lifecycle & Rotation</h4>
              <p className="text-xs text-stone-400 leading-relaxed">
                Tokens can be rotated at any time via <code className="text-stone-300 font-mono">POST /api/db/projects/:projectId/token/rotate</code>. When rotated, old tokens are instantly invalidated.
              </p>
            </div>
          </div>
        )}

        {/* SECTION: CONCURRENCY */}
        {activeSection === "concurrency" && (
          <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl">
            <div className="space-y-2">
              <span className="text-[11px] font-mono uppercase text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full">
                /docs/concurrency
              </span>
              <h2 className="text-xl font-bold text-stone-100">Optimistic Concurrency & expectedSha</h2>
              <p className="text-sm text-stone-400 leading-relaxed">
                To prevent concurrent update hazards in distributed systems, every update or delete request can include an <code className="text-amber-300 font-mono">expectedSha</code> property.
              </p>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-mono font-semibold text-stone-200 uppercase">Conflict Example (HTTP 409)</h4>
              <div className="bg-stone-950 border border-stone-800 rounded-xl p-4 font-mono text-xs text-stone-300 overflow-x-auto">
                <pre>{`// Response if remote SHA differs from expectedSha:
HTTP/1.1 409 Conflict
Content-Type: application/json

{
  "success": false,
  "error": "Conflict",
  "message": "SHA mismatch: expected 730d2c23f3... but found a16f43fd30...",
  "statusCode": 409
}`}</pre>
              </div>
            </div>
          </div>
        )}

        {/* SECTION: ERRORS */}
        {activeSection === "errors" && (
          <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl">
            <div className="space-y-2">
              <span className="text-[11px] font-mono uppercase text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full">
                /docs/errors
              </span>
              <h2 className="text-xl font-bold text-stone-100">HTTP Error Codes & Responses</h2>
              <p className="text-sm text-stone-400">
                All error responses return a standardized JSON structure without exposing internal filesystem paths or stack traces.
              </p>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-xs">
                <div className="p-3 bg-stone-950 border border-stone-800 rounded-xl space-y-1">
                  <div className="text-amber-400 font-bold">400 Bad Request</div>
                  <div className="text-stone-400 text-[11px]">Malformed JSON body or invalid ID regex.</div>
                </div>

                <div className="p-3 bg-stone-950 border border-stone-800 rounded-xl space-y-1">
                  <div className="text-rose-400 font-bold">401 Unauthorized</div>
                  <div className="text-stone-400 text-[11px]">Missing or invalid Bearer authentication token.</div>
                </div>

                <div className="p-3 bg-stone-950 border border-stone-800 rounded-xl space-y-1">
                  <div className="text-rose-400 font-bold">403 Forbidden</div>
                  <div className="text-stone-400 text-[11px]">Project is disabled or cross-project token access attempt.</div>
                </div>

                <div className="p-3 bg-stone-950 border border-stone-800 rounded-xl space-y-1">
                  <div className="text-stone-300 font-bold">404 Not Found</div>
                  <div className="text-stone-400 text-[11px]">Requested collection or record does not exist.</div>
                </div>

                <div className="p-3 bg-stone-950 border border-stone-800 rounded-xl space-y-1">
                  <div className="text-amber-400 font-bold">409 Conflict</div>
                  <div className="text-stone-400 text-[11px]">Optimistic concurrency expectedSha mismatch.</div>
                </div>

                <div className="p-3 bg-stone-950 border border-stone-800 rounded-xl space-y-1">
                  <div className="text-amber-400 font-bold">413 Payload Too Large</div>
                  <div className="text-stone-400 text-[11px]">Payload exceeds 5MB size limit.</div>
                </div>

                <div className="p-3 bg-stone-950 border border-stone-800 rounded-xl space-y-1">
                  <div className="text-purple-400 font-bold">429 Too Many Requests</div>
                  <div className="text-stone-400 text-[11px]">Rate limit exceeded (120 req / 60s per client).</div>
                </div>

                <div className="p-3 bg-stone-950 border border-stone-800 rounded-xl space-y-1">
                  <div className="text-rose-500 font-bold">503 Service Unavailable</div>
                  <div className="text-stone-400 text-[11px]">Backend storage configuration missing.</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SECTION: SDK */}
        {activeSection === "sdk" && (
          <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl">
            <div className="space-y-2">
              <span className="text-[11px] font-mono uppercase text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full">
                /docs/sdk
              </span>
              <h2 className="text-xl font-bold text-stone-100">EncryptedDatabaseClient TypeScript SDK</h2>
              <p className="text-sm text-stone-400">
                A lightweight, HTTP-only client SDK supporting Node.js, browsers, and edge runtimes with zero external runtime dependencies.
              </p>
            </div>

            <div className="bg-stone-950 border border-stone-800 rounded-xl p-4 font-mono text-xs text-stone-300 overflow-x-auto">
              <pre>{`import { EncryptedDatabaseClient } from "./sdk/database/EncryptedDatabaseClient";

const db = new EncryptedDatabaseClient({
  baseUrl: "${origin}",
  projectId: "${projectId}",
  projectToken: "${projectToken}"
});

// Create collection
await db.createCollection("invoices");

// Insert record
const { recordId, sha } = await db.createRecord("invoices", {
  amount: 450,
  currency: "USD",
  status: "paid"
});

// Read record
const record = await db.getRecord("invoices", recordId);

// Update record with optimistic lock
await db.updateRecord("invoices", recordId, {
  ...record.data,
  status: "settled"
}, record.sha);`}</pre>
            </div>
          </div>
        )}

        {/* SECTION: PROJECTS */}
        {activeSection === "projects" && (
          <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl">
            <div className="space-y-2">
              <span className="text-[11px] font-mono uppercase text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full">
                /docs/projects
              </span>
              <h2 className="text-xl font-bold text-stone-100">Project Namespaces API</h2>
              <p className="text-sm text-stone-400">
                Manage separate project partitions, toggle statuses, and rotate credentials.
              </p>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="p-3 bg-stone-950 border border-stone-800 rounded-xl space-y-1">
                <span className="text-amber-400 font-bold">POST /api/db/projects</span>
                <p className="text-stone-400 text-[11px]">Create a new project namespace and generate initial project token.</p>
              </div>

              <div className="p-3 bg-stone-950 border border-stone-800 rounded-xl space-y-1">
                <span className="text-emerald-400 font-bold">GET /api/db/projects</span>
                <p className="text-stone-400 text-[11px]">List all projects for the authenticated user session.</p>
              </div>

              <div className="p-3 bg-stone-950 border border-stone-800 rounded-xl space-y-1">
                <span className="text-sky-400 font-bold">PATCH /api/db/projects/:projectId/status</span>
                <p className="text-stone-400 text-[11px]">Set status to 'active' or 'disabled'.</p>
              </div>

              <div className="p-3 bg-stone-950 border border-stone-800 rounded-xl space-y-1">
                <span className="text-rose-400 font-bold">DELETE /api/db/projects/:projectId</span>
                <p className="text-stone-400 text-[11px]">Delete a project and purge all associated collections.</p>
              </div>
            </div>
          </div>
        )}

        {/* SECTION: COLLECTIONS */}
        {activeSection === "collections" && (
          <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl">
            <div className="space-y-2">
              <span className="text-[11px] font-mono uppercase text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full">
                /docs/collections
              </span>
              <h2 className="text-xl font-bold text-stone-100">Collections API</h2>
              <p className="text-sm text-stone-400">
                Collections act as tables or document categories within a project.
              </p>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="p-3 bg-stone-950 border border-stone-800 rounded-xl space-y-1">
                <span className="text-amber-400 font-bold">POST /api/db/projects/:projectId/collections</span>
                <p className="text-stone-400 text-[11px]">Create a new collection.</p>
              </div>

              <div className="p-3 bg-stone-950 border border-stone-800 rounded-xl space-y-1">
                <span className="text-emerald-400 font-bold">GET /api/db/projects/:projectId/collections</span>
                <p className="text-stone-400 text-[11px]">List all collections in the project.</p>
              </div>

              <div className="p-3 bg-stone-950 border border-stone-800 rounded-xl space-y-1">
                <span className="text-rose-400 font-bold">DELETE /api/db/projects/:projectId/collections/:col</span>
                <p className="text-stone-400 text-[11px]">Delete a collection and all documents inside it.</p>
              </div>
            </div>
          </div>
        )}

        {/* SECTION: RECORDS */}
        {activeSection === "records" && (
          <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl">
            <div className="space-y-2">
              <span className="text-[11px] font-mono uppercase text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full">
                /docs/records
              </span>
              <h2 className="text-xl font-bold text-stone-100">Records CRUD API</h2>
              <p className="text-sm text-stone-400">
                Read, write, update, delete, and inspect raw AES-256-GCM cipher envelopes.
              </p>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="p-3 bg-stone-950 border border-stone-800 rounded-xl space-y-1">
                <span className="text-amber-400 font-bold">POST /api/db/projects/:projectId/collections/:col/records</span>
                <p className="text-stone-400 text-[11px]">Create record with custom or automatic ID.</p>
              </div>

              <div className="p-3 bg-stone-950 border border-stone-800 rounded-xl space-y-1">
                <span className="text-emerald-400 font-bold">GET /api/db/projects/:projectId/collections/:col/records/:recId</span>
                <p className="text-stone-400 text-[11px]">Get decrypted record and current Git tree SHA.</p>
              </div>

              <div className="p-3 bg-stone-950 border border-stone-800 rounded-xl space-y-1">
                <span className="text-sky-400 font-bold">GET /api/db/projects/:projectId/collections/:col/records/:recId/raw</span>
                <p className="text-stone-400 text-[11px]">Inspect raw AES-256-GCM envelope stored on GitHub.</p>
              </div>

              <div className="p-3 bg-stone-950 border border-stone-800 rounded-xl space-y-1">
                <span className="text-amber-400 font-bold">PUT /api/db/projects/:projectId/collections/:col/records/:recId</span>
                <p className="text-stone-400 text-[11px]">Update record with optional expectedSha validation.</p>
              </div>

              <div className="p-3 bg-stone-950 border border-stone-800 rounded-xl space-y-1">
                <span className="text-rose-400 font-bold">DELETE /api/db/projects/:projectId/collections/:col/records/:recId</span>
                <p className="text-stone-400 text-[11px]">Delete record with optional expectedSha validation.</p>
              </div>
            </div>
          </div>
        )}

        {/* SECTION: FILTERING */}
        {activeSection === "filtering" && (
          <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl">
            <div className="space-y-2">
              <span className="text-[11px] font-mono uppercase text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full">
                /docs/filtering
              </span>
              <h2 className="text-xl font-bold text-stone-100">Server-Side Field Filtering</h2>
              <p className="text-sm text-stone-400">
                Filter documents using URL query parameters directly on the list endpoint.
              </p>
            </div>

            <div className="bg-stone-950 border border-stone-800 rounded-xl p-4 font-mono text-xs text-amber-300">
              GET /api/db/projects/:projectId/collections/:col/records?filterField=status&filterValue=active
            </div>
          </div>
        )}

        {/* SECTION: SECURITY */}
        {activeSection === "security" && (
          <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl">
            <div className="space-y-2">
              <span className="text-[11px] font-mono uppercase text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full">
                /docs/security
              </span>
              <h2 className="text-xl font-bold text-stone-100">Cryptographic Security Model</h2>
              <p className="text-sm text-stone-400">
                Defense-in-depth guarantees preventing data leaks, cross-tenant contamination, and path traversal.
              </p>
            </div>

            <div className="space-y-3 font-mono text-xs text-stone-300">
              <div className="p-4 bg-stone-950 border border-stone-800 rounded-xl space-y-1">
                <div className="text-amber-400 font-bold">1. Per-Project AES-256-GCM Keys</div>
                <div className="text-stone-400 text-xs">Each project derives an isolated 256-bit symmetric key using HMAC-SHA256(SessionSecret, ProjectId).</div>
              </div>

              <div className="p-4 bg-stone-950 border border-stone-800 rounded-xl space-y-1">
                <div className="text-emerald-400 font-bold">2. Strict Path Traversal Sanitization</div>
                <div className="text-stone-400 text-xs">All project, collection, and record identifiers are validated against strict regex bounds and normalized to prevent filesystem breakout.</div>
              </div>

              <div className="p-4 bg-stone-950 border border-stone-800 rounded-xl space-y-1">
                <div className="text-sky-400 font-bold">3. Zero Client-Side PAT Knowledge</div>
                <div className="text-stone-400 text-xs">The GitHub Personal Access Token is never transmitted to browsers or returned in any API response.</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
