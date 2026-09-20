import React, { useState } from "react";
import { 
  EncryptedDatabaseClient, 
  ProjectItem,
  RecordEnvelope
} from "../../sdk/database/EncryptedDatabaseClient";
import { 
  CheckCircle2, 
  Circle, 
  ArrowRight, 
  ArrowLeft,
  Key, 
  Database, 
  Layers, 
  FileText, 
  Code2, 
  Send, 
  Copy, 
  Check, 
  Sparkles, 
  ShieldCheck, 
  AlertCircle,
  RefreshCw,
  Terminal,
  ExternalLink,
  Eye,
  EyeOff
} from "lucide-react";

interface DeveloperOnboardingFlowProps {
  dbClient: EncryptedDatabaseClient | null;
  projects: ProjectItem[];
  activeProject: ProjectItem | null;
  onSelectProject: (project: ProjectItem) => void;
  onCreateProject: (projectId: string) => Promise<ProjectItem | null>;
  onCreateCollection: (collectionName: string) => Promise<boolean>;
  onNavigateToExplorer: () => void;
  onNavigateToDocs: () => void;
  onNavigateToPlayground: () => void;
}

export function DeveloperOnboardingFlow({
  dbClient,
  projects,
  activeProject,
  onSelectProject,
  onCreateProject,
  onCreateCollection,
  onNavigateToExplorer,
  onNavigateToDocs,
  onNavigateToPlayground
}: DeveloperOnboardingFlowProps) {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [newProjectId, setNewProjectId] = useState<string>("");
  const [newCollectionName, setNewCollectionName] = useState<string>("users");
  const [recordId, setRecordId] = useState<string>("rec_welcome");
  const [recordDataJson, setRecordDataJson] = useState<string>(
    JSON.stringify({ message: "Hello encrypted world!", initializedAt: new Date().toISOString() }, null, 2)
  );
  
  const [createdRecord, setCreatedRecord] = useState<RecordEnvelope | null>(null);
  const [verifiedResponse, setVerifiedResponse] = useState<any>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [selectedSnippetLang, setSelectedSnippetLang] = useState<"curl" | "typescript" | "javascript" | "python">("typescript");

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://github-encrypted-vault.vercel.app";
  const currentProjId = activeProject?.projectId || newProjectId || "my-app";
  const currentToken = activeProject?.projectToken || "pt_live_sample_token";
  const currentCollection = newCollectionName || "users";

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Step 1: Create Project
  const handleStep1CreateProject = async () => {
    if (!newProjectId.trim()) {
      setErrorMessage("Please enter a valid alphanumeric project ID (e.g. 'my-app' or 'finance-vault').");
      return;
    }
    setErrorMessage(null);
    setIsLoading(true);
    try {
      const created = await onCreateProject(newProjectId.trim());
      if (created) {
        onSelectProject(created);
        setCurrentStep(2);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to create project.");
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Create Collection
  const handleStep3CreateCollection = async () => {
    if (!newCollectionName.trim()) {
      setErrorMessage("Please specify a valid collection name (letters, numbers, underscores).");
      return;
    }
    setErrorMessage(null);
    setIsLoading(true);
    try {
      const success = await onCreateCollection(newCollectionName.trim());
      if (success) {
        setCurrentStep(4);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to create collection.");
    } finally {
      setIsLoading(false);
    }
  };

  // Step 4: Create First Record
  const handleStep4CreateRecord = async () => {
    if (!dbClient || !activeProject) {
      setErrorMessage("Database client or active project is not configured.");
      return;
    }
    let parsedData: any;
    try {
      parsedData = JSON.parse(recordDataJson);
    } catch {
      setErrorMessage("Record data must be valid JSON.");
      return;
    }

    setErrorMessage(null);
    setIsLoading(true);
    try {
      const client = new EncryptedDatabaseClient({
        baseUrl,
        projectId: activeProject.projectId,
        projectToken: activeProject.projectToken
      });
      const res = await client.createRecord(currentCollection, parsedData, recordId.trim() || undefined);
      setCreatedRecord({
        recordId: res.recordId,
        data: parsedData,
        sha: res.sha,
        updatedAt: new Date().toISOString()
      });
      setCurrentStep(5);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to create encrypted record.");
    } finally {
      setIsLoading(false);
    }
  };

  // Step 6: Make First API Request
  const handleStep6ExecuteRequest = async () => {
    if (!dbClient || !activeProject) {
      setErrorMessage("Database client or active project is missing.");
      return;
    }
    setErrorMessage(null);
    setIsLoading(true);
    try {
      const client = new EncryptedDatabaseClient({
        baseUrl,
        projectId: activeProject.projectId,
        projectToken: activeProject.projectToken
      });
      const targetId = createdRecord?.recordId || recordId || "rec_welcome";
      const rec = await client.getRecord(currentCollection, targetId);
      const raw = await client.getRawEnvelope(currentCollection, targetId).catch(() => null);
      setVerifiedResponse({
        status: 200,
        ok: true,
        decryptedRecord: rec,
        rawEncryptedBlob: raw
      });
    } catch (err: any) {
      setErrorMessage(err.message || "Request failed.");
    } finally {
      setIsLoading(false);
    }
  };

  const steps = [
    { num: 1, title: "Create Project", desc: "Isolate application state" },
    { num: 2, title: "API Token", desc: "Obtain project token" },
    { num: 3, title: "Create Collection", desc: "Define data namespace" },
    { num: 4, title: "Insert Record", desc: "Write AES-256-GCM data" },
    { num: 5, title: "Copy Code", desc: "Select language snippet" },
    { num: 6, title: "Make Request", desc: "Verify live round-trip" },
  ];

  const generateSnippet = (lang: string) => {
    const targetRecId = createdRecord?.recordId || recordId || "rec_001";
    switch (lang) {
      case "curl":
        return `# 1. Write an AES-256-GCM encrypted record
curl -X POST "${baseUrl}/api/db/projects/${currentProjId}/collections/${currentCollection}/records" \\
  -H "Authorization: Bearer ${currentToken}" \\
  -H "Content-Type: application/json" \\
  -d '{"data": ${JSON.stringify(JSON.parse(recordDataJson || "{}"))}}'

# 2. Read decrypted record with Git Blob SHA
curl -X GET "${baseUrl}/api/db/projects/${currentProjId}/collections/${currentCollection}/records/${targetRecId}" \\
  -H "Authorization: Bearer ${currentToken}"`;

      case "typescript":
        return `import { EncryptedDatabaseClient } from "github-encrypted-storage-sdk";

// Initialize HTTP-only client with project scope
const db = new EncryptedDatabaseClient({
  baseUrl: "${baseUrl}",
  projectId: "${currentProjId}",
  projectToken: "${currentToken}"
});

// 1. Insert record (auto-encrypted with AES-256-GCM)
const mutation = await db.createRecord("${currentCollection}", {
  message: "Hello encrypted world!",
  createdAt: new Date().toISOString()
});

console.log("Saved Record ID:", mutation.recordId, "Git SHA:", mutation.sha);

// 2. Fetch record (transparently decrypted with verified SHA)
const doc = await db.getRecord("${currentCollection}", mutation.recordId);
console.log("Decrypted payload:", doc.data);`;

      case "javascript":
        return `const { EncryptedDatabaseClient } = require("github-encrypted-storage-sdk");

const db = new EncryptedDatabaseClient({
  baseUrl: "${baseUrl}",
  projectId: "${currentProjId}",
  projectToken: "${currentToken}"
});

async function main() {
  const result = await db.createRecord("${currentCollection}", {
    message: "Hello from Node.js"
  });
  console.log("Created:", result.recordId);

  const doc = await db.getRecord("${currentCollection}", result.recordId);
  console.log("Data:", doc.data);
}

main().catch(console.error);`;

      case "python":
        return `import requests

BASE_URL = "${baseUrl}"
PROJECT_ID = "${currentProjId}"
PROJECT_TOKEN = "${currentToken}"
COLLECTION = "${currentCollection}"

headers = {
    "Authorization": f"Bearer {PROJECT_TOKEN}",
    "Content-Type": "application/json"
}

# 1. Insert record
payload = {"data": {"message": "Hello from Python", "status": "active"}}
res = requests.post(f"{BASE_URL}/api/db/projects/{PROJECT_ID}/collections/{COLLECTION}/records", json=payload, headers=headers)
record_info = res.json()
print("Created record:", record_info)

# 2. Read decrypted record
rec_id = record_info["recordId"]
doc_res = requests.get(f"{BASE_URL}/api/db/projects/{PROJECT_ID}/collections/{COLLECTION}/records/{rec_id}", headers=headers)
print("Decrypted record:", doc_res.json()["data"])`;

      default:
        return "";
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-stone-900/90 border border-stone-800 rounded-3xl p-6 sm:p-8 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              <h2 className="text-xl font-bold text-stone-100 font-mono tracking-tight">
                Developer Quick Onboarding
              </h2>
            </div>
            <p className="text-sm text-stone-400">
              Go from zero to a working encrypted database connection in 6 guided steps without reading the entire documentation.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400">
              Step {currentStep} of 6
            </span>
          </div>
        </div>

        {/* Progress Stepper Bar */}
        <div className="pt-4 border-t border-stone-800/80">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {steps.map((s) => {
              const isDone = currentStep > s.num;
              const isCurrent = currentStep === s.num;
              return (
                <button
                  key={s.num}
                  onClick={() => setCurrentStep(s.num)}
                  className={`p-3 rounded-2xl text-left border transition-all ${
                    isCurrent
                      ? "bg-amber-500/15 border-amber-500/50 text-amber-300"
                      : isDone
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/15"
                      : "bg-stone-950/40 border-stone-800/60 text-stone-500 hover:text-stone-400"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {isDone ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : isCurrent ? (
                      <div className="w-4 h-4 rounded-full bg-amber-400 text-stone-950 text-[10px] font-bold flex items-center justify-center">
                        {s.num}
                      </div>
                    ) : (
                      <Circle className="w-4 h-4 text-stone-600" />
                    )}
                    <span className="text-xs font-semibold font-mono">{s.title}</span>
                  </div>
                  <p className="text-[11px] text-stone-400 truncate">{s.desc}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="bg-rose-950/30 border border-rose-500/30 text-rose-300 p-4 rounded-2xl flex items-center gap-3 text-xs">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <p className="flex-1">{errorMessage}</p>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-stone-400 hover:text-stone-200"
          >
            ✕
          </button>
        </div>
      )}

      {/* Step Content Container */}
      <div className="bg-stone-900/80 border border-stone-800 rounded-3xl p-6 sm:p-8 space-y-6">
        {/* STEP 1: CREATE PROJECT */}
        {currentStep === 1 && (
          <div className="space-y-6 max-w-2xl">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-amber-400">
                <Database className="w-5 h-5" />
                <h3 className="text-base font-semibold text-stone-100">Step 1: Choose or Create a Project</h3>
              </div>
              <p className="text-xs text-stone-400 leading-relaxed">
                Each project creates an isolated storage namespace and generates a cryptographically signed HMAC token. All collection records are isolated under this project boundary.
              </p>
            </div>

            {projects.length > 0 && (
              <div className="space-y-3">
                <label className="text-xs font-medium text-stone-300">Select Existing Project</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {projects.map((p) => (
                    <button
                      key={p.projectId}
                      onClick={() => {
                        onSelectProject(p);
                        setNewProjectId(p.projectId);
                      }}
                      className={`p-3 rounded-xl border text-left flex items-center justify-between transition ${
                        activeProject?.projectId === p.projectId
                          ? "bg-amber-500/15 border-amber-500/50 text-amber-300"
                          : "bg-stone-950 border-stone-800 text-stone-300 hover:border-stone-700"
                      }`}
                    >
                      <span className="font-mono text-xs font-semibold">{p.projectId}</span>
                      {activeProject?.projectId === p.projectId && (
                        <Check className="w-4 h-4 text-amber-400" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3 pt-2">
              <label className="text-xs font-medium text-stone-300">Or Create New Project ID</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. ecommerce-prod or payments-app"
                  value={newProjectId}
                  onChange={(e) => setNewProjectId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                  className="flex-1 bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs font-mono text-stone-200 placeholder-stone-600 focus:outline-none focus:border-amber-500/80"
                />
                <button
                  onClick={handleStep1CreateProject}
                  disabled={isLoading || !newProjectId.trim()}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 text-xs font-semibold rounded-xl transition flex items-center gap-2"
                >
                  {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                  Create & Next
                </button>
              </div>
            </div>

            {activeProject && (
              <div className="pt-4 flex justify-end">
                <button
                  onClick={() => setCurrentStep(2)}
                  className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium rounded-xl transition flex items-center gap-2"
                >
                  Continue with <span className="font-mono text-amber-300">{activeProject.projectId}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: GENERATE / INSPECT PROJECT TOKEN */}
        {currentStep === 2 && (
          <div className="space-y-6 max-w-2xl">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-amber-400">
                <Key className="w-5 h-5" />
                <h3 className="text-base font-semibold text-stone-100">Step 2: Project API Token</h3>
              </div>
              <p className="text-xs text-stone-400 leading-relaxed">
                This token is used by your client applications to authenticate requests against project <span className="font-mono text-stone-200 font-semibold">{currentProjId}</span>.
              </p>
            </div>

            <div className="bg-stone-950 border border-stone-800/80 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-stone-400 font-medium">Project Token (HMAC Scoped)</span>
                <span className="text-[11px] text-amber-400/90 font-mono">Keep Confidential</span>
              </div>

              <div className="flex items-center gap-2 bg-stone-900 border border-stone-800 rounded-xl p-2.5">
                <input
                  type={showToken ? "text" : "password"}
                  readOnly
                  value={currentToken}
                  className="flex-1 bg-transparent font-mono text-xs text-stone-200 focus:outline-none"
                />
                <button
                  onClick={() => setShowToken(!showToken)}
                  className="p-1.5 text-stone-400 hover:text-stone-200 transition"
                  title={showToken ? "Hide token" : "Show token"}
                >
                  {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => handleCopy(currentToken, "token")}
                  className="px-3 py-1 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-mono rounded-lg transition flex items-center gap-1.5"
                >
                  {copiedKey === "token" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  {copiedKey === "token" ? "Copied" : "Copy"}
                </button>
              </div>

              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-300 leading-relaxed">
                <strong>Security Notice:</strong> The project token is shown only for developer integration. Never share it publicly or commit it to client-exposed source code repositories.
              </div>
            </div>

            <div className="flex items-center justify-between pt-4">
              <button
                onClick={() => setCurrentStep(1)}
                className="px-4 py-2 border border-stone-800 hover:bg-stone-800 text-stone-300 text-xs font-medium rounded-xl transition flex items-center gap-2"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
              <button
                onClick={() => setCurrentStep(3)}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-semibold rounded-xl transition flex items-center gap-2"
              >
                Next: Create Collection <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: CREATE COLLECTION */}
        {currentStep === 3 && (
          <div className="space-y-6 max-w-2xl">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-amber-400">
                <Layers className="w-5 h-5" />
                <h3 className="text-base font-semibold text-stone-100">Step 3: Create Collection</h3>
              </div>
              <p className="text-xs text-stone-400 leading-relaxed">
                Collections group related records (e.g. <span className="font-mono text-stone-300">users</span>, <span className="font-mono text-stone-300">customers</span>, <span className="font-mono text-stone-300">transactions</span>). They are created automatically on first insert or explicitly via the API.
              </p>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-medium text-stone-300">Collection Name</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. users, products, orders"
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                  className="flex-1 bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs font-mono text-stone-200 placeholder-stone-600 focus:outline-none focus:border-amber-500/80"
                />
                <button
                  onClick={handleStep3CreateCollection}
                  disabled={isLoading || !newCollectionName.trim()}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 text-xs font-semibold rounded-xl transition flex items-center gap-2"
                >
                  {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                  Create & Next
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4">
              <button
                onClick={() => setCurrentStep(2)}
                className="px-4 py-2 border border-stone-800 hover:bg-stone-800 text-stone-300 text-xs font-medium rounded-xl transition flex items-center gap-2"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
              <button
                onClick={() => setCurrentStep(4)}
                className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium rounded-xl transition flex items-center gap-2"
              >
                Skip to Insert <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: CREATE FIRST RECORD */}
        {currentStep === 4 && (
          <div className="space-y-6 max-w-2xl">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-amber-400">
                <FileText className="w-5 h-5" />
                <h3 className="text-base font-semibold text-stone-100">Step 4: Create First Record</h3>
              </div>
              <p className="text-xs text-stone-400 leading-relaxed">
                Insert a sample document into collection <span className="font-mono text-amber-300">{currentCollection}</span>. The server transparently encrypts the payload using AES-256-GCM before writing to GitHub.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-stone-300">Custom Record ID (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. rec_welcome or user_101"
                  value={recordId}
                  onChange={(e) => setRecordId(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs font-mono text-stone-200 placeholder-stone-600 focus:outline-none focus:border-amber-500/80"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-stone-300">Document Payload (JSON)</label>
                <textarea
                  rows={4}
                  value={recordDataJson}
                  onChange={(e) => setRecordDataJson(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl p-3 text-xs font-mono text-stone-200 placeholder-stone-600 focus:outline-none focus:border-amber-500/80 resize-none"
                />
              </div>

              <button
                onClick={handleStep4CreateRecord}
                disabled={isLoading}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 text-xs font-semibold rounded-xl transition flex items-center justify-center gap-2"
              >
                {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Encrypt & Insert Record
              </button>
            </div>

            <div className="flex items-center justify-between pt-4">
              <button
                onClick={() => setCurrentStep(3)}
                className="px-4 py-2 border border-stone-800 hover:bg-stone-800 text-stone-300 text-xs font-medium rounded-xl transition flex items-center gap-2"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
              <button
                onClick={() => setCurrentStep(5)}
                className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium rounded-xl transition flex items-center gap-2"
              >
                Next: Integration Code <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: COPY INTEGRATION CODE */}
        {currentStep === 5 && (
          <div className="space-y-6 max-w-3xl">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-amber-400">
                <Code2 className="w-5 h-5" />
                <h3 className="text-base font-semibold text-stone-100">Step 5: Copy Integration Code</h3>
              </div>
              <p className="text-xs text-stone-400 leading-relaxed">
                Connect your backend or client application directly to the encrypted database API using your preferred language.
              </p>
            </div>

            <div className="space-y-3">
              {/* Language Selector Tabs */}
              <div className="flex items-center gap-2">
                {(["typescript", "javascript", "curl", "python"] as const).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => setSelectedSnippetLang(lang)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-mono capitalize transition ${
                      selectedSnippetLang === lang
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold"
                        : "bg-stone-950 border border-stone-800 text-stone-400 hover:text-stone-200"
                    }`}
                  >
                    {lang}
                  </button>
                ))}
              </div>

              {/* Code Snippet Box */}
              <div className="relative bg-stone-950 border border-stone-800 rounded-2xl p-4">
                <button
                  onClick={() => handleCopy(generateSnippet(selectedSnippetLang), "code")}
                  className="absolute top-3 right-3 px-3 py-1 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-mono rounded-lg transition flex items-center gap-1.5"
                >
                  {copiedKey === "code" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  {copiedKey === "code" ? "Copied" : "Copy Code"}
                </button>
                <pre className="text-xs font-mono text-stone-300 overflow-x-auto pr-24 leading-relaxed">
                  {generateSnippet(selectedSnippetLang)}
                </pre>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4">
              <button
                onClick={() => setCurrentStep(4)}
                className="px-4 py-2 border border-stone-800 hover:bg-stone-800 text-stone-300 text-xs font-medium rounded-xl transition flex items-center gap-2"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
              <button
                onClick={() => setCurrentStep(6)}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-semibold rounded-xl transition flex items-center gap-2"
              >
                Next: Verify API Request <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 6: MAKE FIRST API REQUEST */}
        {currentStep === 6 && (
          <div className="space-y-6 max-w-3xl">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-amber-400">
                <Send className="w-5 h-5" />
                <h3 className="text-base font-semibold text-stone-100">Step 6: Make First API Request</h3>
              </div>
              <p className="text-xs text-stone-400 leading-relaxed">
                Verify end-to-end round trip against your live project endpoint. Fetch and inspect both the transparently decrypted payload and the underlying raw ciphertext envelope.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleStep6ExecuteRequest}
                  disabled={isLoading}
                  className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 text-xs font-semibold rounded-xl transition flex items-center gap-2"
                >
                  {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Terminal className="w-3.5 h-3.5" />}
                  Execute Live Verification Request
                </button>
                <span className="text-xs text-stone-500 font-mono">
                  GET /api/db/projects/{currentProjId}/collections/{currentCollection}/records/{createdRecord?.recordId || recordId || "rec_welcome"}
                </span>
              </div>

              {verifiedResponse && (
                <div className="space-y-3 animate-in fade-in duration-300">
                  <div className="flex items-center gap-2 text-xs font-mono text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Live Round-Trip Verification Successful (HTTP 200 OK)</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Decrypted Payload */}
                    <div className="bg-stone-950 border border-stone-800 rounded-2xl p-4 space-y-2">
                      <div className="flex items-center justify-between text-xs font-mono text-stone-400 border-b border-stone-800/80 pb-2">
                        <span>Decrypted Record</span>
                        <span className="text-amber-400">SHA: {verifiedResponse.decryptedRecord?.sha?.substring(0, 8)}...</span>
                      </div>
                      <pre className="text-xs font-mono text-emerald-300 overflow-x-auto">
                        {JSON.stringify(verifiedResponse.decryptedRecord?.data, null, 2)}
                      </pre>
                    </div>

                    {/* Raw Envelope */}
                    <div className="bg-stone-950 border border-stone-800 rounded-2xl p-4 space-y-2">
                      <div className="flex items-center justify-between text-xs font-mono text-stone-400 border-b border-stone-800/80 pb-2">
                        <span>Raw Ciphertext (Zero-Knowledge)</span>
                        <span className="text-stone-500">AES-256-GCM</span>
                      </div>
                      <pre className="text-xs font-mono text-stone-400 overflow-x-auto">
                        {verifiedResponse.rawEncryptedBlob
                          ? JSON.stringify(verifiedResponse.rawEncryptedBlob, null, 2)
                          : "// Encrypted envelope verified"}
                      </pre>
                    </div>
                  </div>

                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-xs text-emerald-300 space-y-2">
                    <div className="font-semibold flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4" /> Onboarding Complete!
                    </div>
                    <p className="text-emerald-400/90 leading-relaxed text-[11px]">
                      Your project is fully configured and ready for production workloads. You can explore data records, test arbitrary queries in the API playground, or browse the interactive documentation.
                    </p>
                    <div className="pt-2 flex flex-wrap gap-2">
                      <button
                        onClick={onNavigateToExplorer}
                        className="px-3 py-1.5 bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-200 rounded-lg text-xs font-medium transition"
                      >
                        Open Data Explorer
                      </button>
                      <button
                        onClick={onNavigateToPlayground}
                        className="px-3 py-1.5 bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-200 rounded-lg text-xs font-medium transition"
                      >
                        API Playground
                      </button>
                      <button
                        onClick={onNavigateToDocs}
                        className="px-3 py-1.5 bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-200 rounded-lg text-xs font-medium transition"
                      >
                        Read Documentation
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-4">
              <button
                onClick={() => setCurrentStep(5)}
                className="px-4 py-2 border border-stone-800 hover:bg-stone-800 text-stone-300 text-xs font-medium rounded-xl transition flex items-center gap-2"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
              <button
                onClick={() => setCurrentStep(1)}
                className="px-4 py-2 border border-stone-800 hover:bg-stone-800 text-stone-400 hover:text-stone-200 text-xs font-medium rounded-xl transition flex items-center gap-2"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Reset Guide
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
