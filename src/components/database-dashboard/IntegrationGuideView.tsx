import React, { useState } from "react";
import { ProjectItem } from "../../sdk/database/EncryptedDatabaseClient";
import { 
  Code, 
  Terminal, 
  Copy, 
  Check, 
  BookOpen, 
  ShieldCheck, 
  Cpu, 
  Layers, 
  GitCommit, 
  Lock,
  ExternalLink
} from "lucide-react";

interface IntegrationGuideViewProps {
  activeProject: ProjectItem | null;
}

export function IntegrationGuideView({ activeProject }: IntegrationGuideViewProps) {
  const [activeLang, setActiveLang] = useState<"ts" | "curl">("ts");
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const projectId = activeProject?.projectId || "my_app_prod";
  const token = activeProject?.projectToken || "pt_live_9a8b7c6d5e4f3a2b1c0d_sample";
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://your-domain.com";

  const handleCopy = (text: string, section: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const tsCode = `import { EncryptedDatabaseClient } from "@encrypted-vault/database";

// 1. Initialize the client with your project credentials
const db = new EncryptedDatabaseClient({
  baseUrl: "${baseUrl}",
  projectId: "${projectId}",
  projectToken: "${token}",
});

async function main() {
  // 2. Ensure collection exists
  await db.createCollection("customers");

  // 3. Insert an encrypted record (AES-256-GCM)
  const created = await db.createRecord("customers", {
    name: "Alex Mercer",
    tier: "enterprise",
    status: "active",
    credits: 1250,
  });
  console.log("Created Record ID:", created.recordId, "Git SHA:", created.sha);

  // 4. Retrieve single decrypted document
  const customer = await db.getRecord("customers", created.recordId);
  console.log("Customer data:", customer.data);

  // 5. Query records with field filtering
  const activeUsers = await db.listRecords("customers", {
    filterField: "status",
    filterValue: "active",
  });
  console.log("Found active records:", activeUsers.length);

  // 6. Optimistic Concurrency update (pass current Git SHA)
  const updated = await db.updateRecord(
    "customers",
    created.recordId,
    { ...customer.data, credits: 1500 },
    customer.sha // Guards against concurrent race conditions
  );
  console.log("Updated with new SHA:", updated.sha);
}

main().catch(console.error);`;

  const curlSnippets = [
    {
      title: "1. Create Collection",
      command: `curl -X POST "${baseUrl}/api/db/projects/${projectId}/collections" \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"collection": "customers"}'`,
    },
    {
      title: "2. Insert Record",
      command: `curl -X POST "${baseUrl}/api/db/projects/${projectId}/collections/customers/records" \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "recordId": "cust_001",
    "data": { "name": "Jane Doe", "status": "active", "balance": 450 }
  }'`,
    },
    {
      title: "3. Retrieve Decrypted Record",
      command: `curl -X GET "${baseUrl}/api/db/projects/${projectId}/collections/customers/records/cust_001" \\
  -H "Authorization: Bearer ${token}"`,
    },
    {
      title: "4. Query Records with Filter",
      command: `curl -X GET "${baseUrl}/api/db/projects/${projectId}/collections/customers/records?filterField=status&filterValue=active" \\
  -H "Authorization: Bearer ${token}"`,
    },
    {
      title: "5. Optimistic Concurrency Update",
      command: `curl -X PUT "${baseUrl}/api/db/projects/${projectId}/collections/customers/records/cust_001" \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "expectedSha": "8a3f91b2c4e5...",
    "data": { "name": "Jane Doe", "status": "active", "balance": 600 }
  }'`,
    },
    {
      title: "6. Inspect Raw AES-256-GCM Envelope on GitHub",
      command: `curl -X GET "${baseUrl}/api/db/projects/${projectId}/collections/customers/records/cust_001/raw" \\
  -H "Authorization: Bearer ${token}"`,
    },
    {
      title: "7. Delete Record",
      command: `curl -X DELETE "${baseUrl}/api/db/projects/${projectId}/collections/customers/records/cust_001?expectedSha=8a3f91b2c4e5..." \\
  -H "Authorization: Bearer ${token}"`,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-5 sm:p-6 space-y-3">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-amber-400" />
          <h2 className="text-lg font-semibold text-stone-100">Developer Integration & API Documentation</h2>
        </div>
        <p className="text-xs sm:text-sm text-stone-400 max-w-3xl leading-relaxed">
          Connect your Node.js, Next.js, Python, or client applications directly to your isolated GitHub Encrypted Database using HMAC-signed Bearer tokens.
        </p>
      </div>

      {/* Language / Tab Selector */}
      <div className="flex items-center justify-between border-b border-stone-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveLang("ts")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-medium transition flex items-center gap-2 ${
              activeLang === "ts"
                ? "bg-amber-500 text-stone-950 shadow-sm"
                : "bg-stone-900 text-stone-400 hover:text-stone-200 border border-stone-800"
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>TypeScript SDK</span>
          </button>

          <button
            onClick={() => setActiveLang("curl")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-medium transition flex items-center gap-2 ${
              activeLang === "curl"
                ? "bg-amber-500 text-stone-950 shadow-sm"
                : "bg-stone-900 text-stone-400 hover:text-stone-200 border border-stone-800"
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>cURL / REST API</span>
          </button>
        </div>

        <div className="text-[11px] font-mono text-stone-500">
          Base: <span className="text-stone-300">{baseUrl}</span>
        </div>
      </div>

      {/* Code Snippets Content */}
      {activeLang === "ts" ? (
        <div className="bg-stone-900/70 border border-stone-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-stone-400">TypeScript / JavaScript Client</span>
            <button
              onClick={() => handleCopy(tsCode, "ts-all")}
              className="px-2.5 py-1 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs rounded-lg flex items-center gap-1.5 font-mono transition"
            >
              {copiedSection === "ts-all" ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copy Code</span>
                </>
              )}
            </button>
          </div>

          <div className="bg-stone-950 border border-stone-800/90 rounded-xl p-4 text-xs font-mono text-stone-200 overflow-x-auto leading-relaxed scrollbar-thin">
            <pre>{tsCode}</pre>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {curlSnippets.map((snip, idx) => (
            <div
              key={idx}
              className="bg-stone-900/70 border border-stone-800 rounded-2xl p-4 space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold font-mono text-amber-300">
                  {snip.title}
                </span>
                <button
                  onClick={() => handleCopy(snip.command, `curl-${idx}`)}
                  className="px-2 py-1 bg-stone-800 hover:bg-stone-700 text-stone-300 text-[11px] rounded-lg flex items-center gap-1 font-mono transition"
                >
                  {copiedSection === `curl-${idx}` ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy cURL</span>
                    </>
                  )}
                </button>
              </div>

              <div className="bg-stone-950 border border-stone-800 rounded-xl p-3 text-xs font-mono text-stone-300 overflow-x-auto scrollbar-thin">
                <pre>{snip.command}</pre>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Optimistic Concurrency Explained */}
      <div className="bg-stone-900/50 border border-stone-800 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2.5 text-sky-400">
          <GitCommit className="w-5 h-5" />
          <h3 className="text-sm font-semibold font-mono uppercase tracking-wider">
            Optimistic Concurrency & Git SHA Verification
          </h3>
        </div>

        <p className="text-xs text-stone-300 leading-relaxed">
          Because every record is stored as a Git blob in your repository, every modification generates a unique, immutable Git SHA. When your application updates a record, sending <code className="font-mono text-amber-300 bg-stone-950 px-1.5 py-0.5 rounded">expectedSha</code> guarantees that no other client has modified the document in the meantime. If a race occurs, the API returns <code className="font-mono text-rose-400 bg-stone-950 px-1.5 py-0.5 rounded">409 Conflict</code> so you can re-fetch and safely merge.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          <div className="bg-stone-950/70 border border-stone-800/80 rounded-xl p-3.5 space-y-1.5">
            <span className="text-[11px] font-mono text-amber-400">STEP 1</span>
            <h4 className="text-xs font-semibold text-stone-200">Fetch Record + SHA</h4>
            <p className="text-[11px] text-stone-400">Client reads record and receives decrypted data along with <code className="font-mono text-stone-300">sha</code>.</p>
          </div>

          <div className="bg-stone-950/70 border border-stone-800/80 rounded-xl p-3.5 space-y-1.5">
            <span className="text-[11px] font-mono text-amber-400">STEP 2</span>
            <h4 className="text-xs font-semibold text-stone-200">Submit with Expected SHA</h4>
            <p className="text-[11px] text-stone-400">Update payload includes <code className="font-mono text-stone-300">expectedSha</code> to bind the mutation.</p>
          </div>

          <div className="bg-stone-950/70 border border-stone-800/80 rounded-xl p-3.5 space-y-1.5">
            <span className="text-[11px] font-mono text-amber-400">STEP 3</span>
            <h4 className="text-xs font-semibold text-stone-200">Atomic GitHub Commit</h4>
            <p className="text-[11px] text-stone-400">Server validates SHA matches remote tree before committing new encrypted blob.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
