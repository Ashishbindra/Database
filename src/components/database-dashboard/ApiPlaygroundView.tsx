import React, { useState, useEffect } from "react";
import { ProjectItem } from "../../sdk/database/EncryptedDatabaseClient";
import { 
  Play, 
  Copy, 
  Check, 
  Terminal, 
  Code2, 
  Send, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Layers, 
  Clock, 
  SlidersHorizontal,
  ChevronDown,
  Sparkles
} from "lucide-react";

interface ApiPlaygroundViewProps {
  activeProject: ProjectItem | null;
  projects: ProjectItem[];
}

interface EndpointPreset {
  name: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  pathTemplate: string;
  defaultBody?: any;
  description: string;
  authType: "project" | "session" | "none";
}

export function ApiPlaygroundView({ activeProject, projects }: ApiPlaygroundViewProps) {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://github-encrypted-vault.vercel.app";
  
  const [selectedProjectId, setSelectedProjectId] = useState<string>(activeProject?.projectId || (projects[0]?.projectId || "my-app"));
  const [method, setMethod] = useState<"GET" | "POST" | "PUT" | "PATCH" | "DELETE">("GET");
  const [endpointPath, setEndpointPath] = useState<string>("/api/health");
  const [customHeaders, setCustomHeaders] = useState<string>("{\n  \"Accept\": \"application/json\"\n}");
  const [requestBody, setRequestBody] = useState<string>("");
  const [authType, setAuthType] = useState<"project" | "session" | "none">("project");

  // Execution state
  const [isLoading, setIsLoading] = useState(false);
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [statusText, setStatusText] = useState<string>("");
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [responseHeaders, setResponseHeaders] = useState<Record<string, string>>({});
  const [responseBody, setResponseBody] = useState<string>("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeCodeTab, setActiveCodeTab] = useState<"curl" | "js" | "python">("curl");

  // Update selected project when activeProject prop changes
  useEffect(() => {
    if (activeProject?.projectId) {
      setSelectedProjectId(activeProject.projectId);
    }
  }, [activeProject?.projectId]);

  const currentProject = projects.find(p => p.projectId === selectedProjectId) || activeProject;
  const projectToken = currentProject?.projectToken || "PROJECT_API_TOKEN";

  const presets: EndpointPreset[] = [
    {
      name: "API Health Check",
      method: "GET",
      pathTemplate: "/api/health",
      description: "Checks service uptime and cluster status.",
      authType: "none",
    },
    {
      name: "Get Usage Telemetry",
      method: "GET",
      pathTemplate: "/api/db/usage",
      description: "Fetch developer account usage and project statistics.",
      authType: "session",
    },
    {
      name: "Get Project Statistics",
      method: "GET",
      pathTemplate: `/api/db/projects/${selectedProjectId}/stats`,
      description: "Fetch collection counts and record metrics for project.",
      authType: "project",
    },
    {
      name: "List Collections",
      method: "GET",
      pathTemplate: `/api/db/projects/${selectedProjectId}/collections`,
      description: "List all collections in the current project.",
      authType: "project",
    },
    {
      name: "Create Collection",
      method: "POST",
      pathTemplate: `/api/db/projects/${selectedProjectId}/collections`,
      defaultBody: { collection: "customers" },
      description: "Create a new encrypted collection namespace.",
      authType: "project",
    },
    {
      name: "List Records",
      method: "GET",
      pathTemplate: `/api/db/projects/${selectedProjectId}/collections/customers/records`,
      description: "List decrypted records in a collection.",
      authType: "project",
    },
    {
      name: "Create Record",
      method: "POST",
      pathTemplate: `/api/db/projects/${selectedProjectId}/collections/customers/records`,
      defaultBody: {
        recordId: "cust_001",
        data: {
          name: "Acme Corp",
          plan: "enterprise",
          tier: "active",
          seats: 50
        }
      },
      description: "Encrypt and store a new JSON record.",
      authType: "project",
    },
    {
      name: "Get Single Record",
      method: "GET",
      pathTemplate: `/api/db/projects/${selectedProjectId}/collections/customers/records/cust_001`,
      description: "Fetch a single decrypted record envelope by ID.",
      authType: "project",
    },
    {
      name: "Get Raw Encrypted Envelope",
      method: "GET",
      pathTemplate: `/api/db/projects/${selectedProjectId}/collections/customers/records/cust_001/raw`,
      description: "Inspect the raw AES-256-GCM ciphertext persisted on GitHub.",
      authType: "project",
    },
    {
      name: "Update Record (Optimistic Concurrency)",
      method: "PUT",
      pathTemplate: `/api/db/projects/${selectedProjectId}/collections/customers/records/cust_001`,
      defaultBody: {
        expectedSha: "REPLACE_WITH_CURRENT_SHA",
        data: {
          name: "Acme Corp",
          plan: "enterprise",
          tier: "active",
          seats: 100
        }
      },
      description: "Update record verifying SHA to prevent race conditions.",
      authType: "project",
    },
    {
      name: "Delete Record",
      method: "DELETE",
      pathTemplate: `/api/db/projects/${selectedProjectId}/collections/customers/records/cust_001`,
      description: "Delete an encrypted record from GitHub Git tree.",
      authType: "project",
    }
  ];

  const handleSelectPreset = (preset: EndpointPreset) => {
    setMethod(preset.method);
    setEndpointPath(preset.pathTemplate.replace(/\${selectedProjectId}/g, selectedProjectId));
    setAuthType(preset.authType);
    if (preset.defaultBody) {
      setRequestBody(JSON.stringify(preset.defaultBody, null, 2));
    } else {
      setRequestBody("");
    }
  };

  const handleExecuteRequest = async () => {
    setIsLoading(true);
    setStatusCode(null);
    setStatusText("");
    setLatencyMs(null);
    setResponseHeaders({});
    setResponseBody("");

    const startTime = performance.now();
    try {
      let headersObj: Record<string, string> = {};
      try {
        headersObj = JSON.parse(customHeaders);
      } catch {
        headersObj = { "Accept": "application/json" };
      }

      if (authType === "project" && projectToken) {
        headersObj["Authorization"] = `Bearer ${projectToken}`;
      }

      if (method !== "GET" && method !== "DELETE" && requestBody.trim()) {
        headersObj["Content-Type"] = "application/json";
      }

      const res = await fetch(endpointPath, {
        method,
        headers: headersObj,
        body: (method !== "GET" && method !== "DELETE" && requestBody.trim()) ? requestBody : undefined,
      });

      const elapsed = Math.round(performance.now() - startTime);
      setLatencyMs(elapsed);
      setStatusCode(res.status);
      setStatusText(res.statusText || "");

      // Extract safe headers
      const safeHdrs: Record<string, string> = {};
      const allowedHeaders = [
        "content-type",
        "x-ratelimit-limit",
        "x-ratelimit-remaining",
        "x-ratelimit-reset",
        "etag",
        "cache-control"
      ];
      res.headers.forEach((val, key) => {
        if (allowedHeaders.includes(key.toLowerCase()) || key.toLowerCase().startsWith("x-")) {
          safeHdrs[key] = val;
        }
      });
      setResponseHeaders(safeHdrs);

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const json = await res.json();
        setResponseBody(JSON.stringify(json, null, 2));
      } else {
        const text = await res.text();
        setResponseBody(text);
      }
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - startTime);
      setLatencyMs(elapsed);
      setStatusCode(0);
      setStatusText("Network Request Failed");
      setResponseBody(JSON.stringify({ error: "Client Error", message: err.message }, null, 2));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Code Snippet Generators
  const curlSnippet = `curl -X ${method} "${origin}${endpointPath}" \\
  -H "Accept: application/json"${authType === "project" ? ` \\\n  -H "Authorization: Bearer ${projectToken}"` : ""}${
    requestBody && method !== "GET" ? ` \\\n  -H "Content-Type: application/json" \\\n  -d '${requestBody.replace(/\n/g, "")}'` : ""
  }`;

  const jsSnippet = `const response = await fetch("${origin}${endpointPath}", {
  method: "${method}",
  headers: {
    "Accept": "application/json",${authType === "project" ? `\n    "Authorization": "Bearer ${projectToken}",` : ""}${
    requestBody && method !== "GET" ? `\n    "Content-Type": "application/json",` : ""
  }
  ${requestBody && method !== "GET" ? `body: JSON.stringify(${requestBody.replace(/\n/g, "\n  ")})` : ""}
});
const data = await response.json();
console.log(data);`;

  const pythonSnippet = `import requests

url = "${origin}${endpointPath}"
headers = {
    "Accept": "application/json",${authType === "project" ? `\n    "Authorization": "Bearer ${projectToken}",` : ""}${
    requestBody && method !== "GET" ? `\n    "Content-Type": "application/json",` : ""
  }
}
${requestBody && method !== "GET" ? `payload = ${requestBody}\nresponse = requests.${method.toLowerCase()}(url, headers=headers, json=payload)` : `response = requests.${method.toLowerCase()}(url, headers=headers)`}

print("Status:", response.status_code)
print("Response:", response.json())`;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-5 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Terminal className="w-5 h-5 text-amber-400" />
              <h2 className="text-base font-semibold text-stone-100">Interactive API Playground</h2>
            </div>
            <p className="text-xs text-stone-400">
              Test and simulate live REST API calls against your project namespaces with real-time execution and code generation.
            </p>
          </div>

          {/* Project Selector */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-mono text-stone-400">Target Project:</label>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="bg-stone-950 border border-stone-700 rounded-xl px-3 py-1.5 text-xs font-mono text-amber-300 focus:outline-none focus:border-amber-500"
            >
              {projects.map((p) => (
                <option key={p.projectId} value={p.projectId}>
                  {p.projectId}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Preset Chips */}
        <div className="pt-3 border-t border-stone-800 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <span className="text-[11px] font-mono text-stone-500 uppercase flex-shrink-0">Presets:</span>
          {presets.map((preset, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSelectPreset(preset)}
              className="px-2.5 py-1 rounded-lg bg-stone-950 hover:bg-stone-800 border border-stone-800/90 text-stone-300 hover:text-amber-300 text-xs font-mono whitespace-nowrap transition"
            >
              <span className={`text-[10px] font-bold mr-1.5 ${
                preset.method === "GET" ? "text-emerald-400" :
                preset.method === "POST" ? "text-amber-400" :
                preset.method === "PUT" ? "text-sky-400" : "text-rose-400"
              }`}>
                {preset.method}
              </span>
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* Main Request / Response Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Request Builder */}
        <div className="lg:col-span-6 space-y-4">
          <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-stone-200 font-mono uppercase tracking-wider">
                Request Configuration
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-stone-500">Auth:</span>
                <select
                  value={authType}
                  onChange={(e) => setAuthType(e.target.value as any)}
                  className="bg-stone-950 border border-stone-800 rounded-lg px-2 py-0.5 text-xs font-mono text-stone-300"
                >
                  <option value="project">Project Token</option>
                  <option value="session">User Session</option>
                  <option value="none">None</option>
                </select>
              </div>
            </div>

            {/* Method & URL Input */}
            <div className="flex items-center gap-2">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as any)}
                className="bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-amber-300 focus:outline-none focus:border-amber-500"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
                <option value="DELETE">DELETE</option>
              </select>

              <input
                type="text"
                value={endpointPath}
                onChange={(e) => setEndpointPath(e.target.value)}
                placeholder="/api/db/projects/..."
                className="flex-1 bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-xs font-mono text-stone-200 focus:outline-none focus:border-amber-500"
              />

              <button
                type="button"
                onClick={handleExecuteRequest}
                disabled={isLoading}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition font-mono flex-shrink-0"
              >
                {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>Send</span>
              </button>
            </div>

            {/* Request Body Editor */}
            {method !== "GET" && method !== "DELETE" && (
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-stone-400 flex items-center justify-between">
                  <span>JSON Request Body</span>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        const parsed = JSON.parse(requestBody);
                        setRequestBody(JSON.stringify(parsed, null, 2));
                      } catch {}
                    }}
                    className="text-[11px] text-amber-400 hover:text-amber-300 font-mono"
                  >
                    Format JSON
                  </button>
                </label>
                <textarea
                  rows={8}
                  value={requestBody}
                  onChange={(e) => setRequestBody(e.target.value)}
                  placeholder='{\n  "data": { ... }\n}'
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl p-3 text-xs font-mono text-emerald-300 focus:outline-none focus:border-amber-500 scrollbar-thin"
                />
              </div>
            )}

            {/* Generated Code Snippets Tabs */}
            <div className="space-y-2 pt-2 border-t border-stone-800/80">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 bg-stone-950 p-0.5 rounded-lg border border-stone-800">
                  <button
                    type="button"
                    onClick={() => setActiveCodeTab("curl")}
                    className={`px-2.5 py-1 text-[11px] font-mono rounded ${
                      activeCodeTab === "curl" ? "bg-stone-800 text-amber-300 font-bold" : "text-stone-400 hover:text-stone-200"
                    }`}
                  >
                    cURL
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveCodeTab("js")}
                    className={`px-2.5 py-1 text-[11px] font-mono rounded ${
                      activeCodeTab === "js" ? "bg-stone-800 text-amber-300 font-bold" : "text-stone-400 hover:text-stone-200"
                    }`}
                  >
                    Fetch (JS)
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveCodeTab("python")}
                    className={`px-2.5 py-1 text-[11px] font-mono rounded ${
                      activeCodeTab === "python" ? "bg-stone-800 text-amber-300 font-bold" : "text-stone-400 hover:text-stone-200"
                    }`}
                  >
                    Python
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const snippet = activeCodeTab === "curl" ? curlSnippet : activeCodeTab === "js" ? jsSnippet : pythonSnippet;
                    handleCopy(snippet, "code_snippet");
                  }}
                  className="px-2.5 py-1 bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs rounded-lg font-mono flex items-center gap-1 transition"
                >
                  {copiedKey === "code_snippet" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>Copy</span>
                </button>
              </div>

              <div className="bg-stone-950 border border-stone-800 rounded-xl p-3 font-mono text-[11px] text-stone-300 overflow-x-auto max-h-48 scrollbar-thin">
                <pre>{activeCodeTab === "curl" ? curlSnippet : activeCodeTab === "js" ? jsSnippet : pythonSnippet}</pre>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Response Inspector */}
        <div className="lg:col-span-6 space-y-4">
          <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-stone-200 font-mono uppercase tracking-wider">
                Response Output
              </h3>

              {statusCode !== null && (
                <div className="flex items-center gap-2 font-mono text-xs">
                  <span className={`px-2.5 py-0.5 rounded-full font-bold border ${
                    statusCode >= 200 && statusCode < 300 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                    statusCode === 409 ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                    "bg-rose-500/10 text-rose-400 border-rose-500/20"
                  }`}>
                    HTTP {statusCode} {statusText}
                  </span>
                  {latencyMs !== null && (
                    <span className="text-stone-500 text-[11px] flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{latencyMs}ms</span>
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Response Headers */}
            {Object.keys(responseHeaders).length > 0 && (
              <div className="bg-stone-950/70 border border-stone-800/80 rounded-xl p-3 space-y-1">
                <div className="text-[10px] font-mono text-stone-500 uppercase">Response Headers</div>
                <div className="space-y-0.5 font-mono text-[11px] text-stone-400">
                  {Object.entries(responseHeaders).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between">
                      <span className="text-stone-500">{k}:</span>
                      <span className="text-stone-300 truncate max-w-xs">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Response Body Box */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-mono text-stone-400">Response Body</label>
                {responseBody && (
                  <button
                    type="button"
                    onClick={() => handleCopy(responseBody, "response_body")}
                    className="text-[11px] text-stone-400 hover:text-stone-200 font-mono flex items-center gap-1"
                  >
                    {copiedKey === "response_body" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>Copy JSON</span>
                  </button>
                )}
              </div>

              <div className="bg-stone-950 border border-stone-800 rounded-xl p-3 font-mono text-xs text-amber-300/90 overflow-x-auto min-h-64 max-h-96 scrollbar-thin">
                {isLoading ? (
                  <div className="flex items-center justify-center h-48 text-stone-500 gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                    <span>Executing request...</span>
                  </div>
                ) : responseBody ? (
                  <pre>{responseBody}</pre>
                ) : (
                  <div className="flex flex-col items-center justify-center h-48 text-stone-600 space-y-1">
                    <Terminal className="w-6 h-6" />
                    <span className="text-xs">Select an endpoint or click Send to execute</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
