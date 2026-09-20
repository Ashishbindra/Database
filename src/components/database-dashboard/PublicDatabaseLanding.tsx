import React, { useState } from "react";
import {
  Database,
  ShieldCheck,
  Zap,
  Lock,
  GitBranch,
  Code,
  ArrowRight,
  Terminal,
  CheckCircle2,
  Server,
  Key,
  Layers,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Cpu,
  RefreshCw,
  Copy,
  Check,
  AlertTriangle
} from "lucide-react";

interface PublicDatabaseLandingProps {
  onOpenDashboard: () => void;
  onOpenDocs: () => void;
  onOpenDemo: () => void;
}

export function PublicDatabaseLanding({
  onOpenDashboard,
  onOpenDocs,
  onOpenDemo,
}: PublicDatabaseLandingProps) {
  const [activeCodeTab, setActiveCodeTab] = useState<"ts" | "curl" | "fetch">("ts");
  const [copiedCode, setCopiedCode] = useState(false);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://your-domain.com";

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const sampleSnippet = {
    ts: `import { EncryptedDatabaseClient } from "@encrypted-vault/database";

const db = new EncryptedDatabaseClient({
  baseUrl: "${baseUrl}",
  projectId: "myapp_production",
  projectToken: "pt_live_9a8b7c6d5e4f3a2b1c0d",
});

// 1. Write an AES-256-GCM encrypted document
const record = await db.createRecord("users", {
  name: "Sarah Connor",
  role: "engineer",
  active: true,
});

// 2. Read decrypted document with immutable Git Blob SHA
const user = await db.getRecord("users", record.recordId);
console.log("Decrypted User:", user.data, "Git SHA:", user.sha);

// 3. Optimistic Concurrency Update
await db.updateRecord("users", record.recordId, { ...user.data, active: false }, user.sha);`,
    curl: `# 1. Insert encrypted record
curl -X POST "${baseUrl}/api/db/projects/myapp_prod/collections/users/records" \\
  -H "Authorization: Bearer <PROJECT_TOKEN>" \\
  -H "Content-Type: application/json" \\
  -d '{"data": {"name": "Sarah Connor", "role": "engineer"}}'

# 2. Retrieve decrypted record
curl -X GET "${baseUrl}/api/db/projects/myapp_prod/collections/users/records/rec_001" \\
  -H "Authorization: Bearer <PROJECT_TOKEN>"`,
    fetch: `// Standard fetch in browser or edge worker
const res = await fetch("${baseUrl}/api/db/projects/myapp_prod/collections/users/records", {
  method: "POST",
  headers: {
    "Authorization": "Bearer " + PROJECT_TOKEN,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    data: { name: "Sarah Connor", role: "engineer" }
  })
});
const { recordId, sha } = await res.json();`
  };

  return (
    <div className="space-y-16 py-4">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-stone-900 via-stone-900/90 to-stone-950 border border-stone-800/80 p-8 sm:p-12 lg:p-16">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.06),transparent_50%)]" />
        
        <div className="relative z-10 max-w-3xl space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-mono">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Zero-Cost Serverless Encrypted Database</span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-stone-100 tracking-tight leading-tight">
            Encrypted Database API <br className="hidden sm:inline" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-amber-200 to-stone-300">
              Powered by GitHub Git Storage
            </span>
          </h1>

          <p className="text-base sm:text-lg text-stone-400 leading-relaxed max-w-2xl">
            A production-ready, AES-256-GCM encrypted multi-tenant database backend. Store structured documents directly in your private GitHub repository with zero cloud database fees, full optimistic concurrency, and strict project namespace isolation.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={onOpenDashboard}
              className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold text-sm rounded-xl transition shadow-lg shadow-amber-500/10 flex items-center gap-2"
            >
              <Database className="w-4 h-4" />
              <span>Open Developer Console</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={onOpenDocs}
              className="px-5 py-3 bg-stone-800/80 hover:bg-stone-700 text-stone-200 text-sm font-medium rounded-xl border border-stone-700/60 transition flex items-center gap-2"
            >
              <Code className="w-4 h-4 text-amber-400" />
              <span>Read API Reference</span>
            </button>

            <button
              onClick={onOpenDemo}
              className="px-5 py-3 bg-stone-900 hover:bg-stone-800 text-stone-400 hover:text-stone-200 text-sm font-medium rounded-xl border border-stone-800 transition flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Try Demo App</span>
            </button>
          </div>
        </div>
      </div>

      {/* Zero-Cost Architecture Highlights */}
      <div className="space-y-6">
        <div className="text-center space-y-2 max-w-2xl mx-auto">
          <h2 className="text-xl sm:text-2xl font-bold text-stone-100">Why GitHub-Backed Database?</h2>
          <p className="text-xs sm:text-sm text-stone-400">
            Engineered for developers building prototypes, internal tooling, dashboards, and indie apps who want persistence without cloud database costs.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-stone-900/60 border border-stone-800 rounded-2xl p-6 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-stone-100">$0 Recurring Infrastructure</h3>
            <p className="text-xs text-stone-400 leading-relaxed">
              No managed PostgreSQL, MongoDB, or Redis instances to pay for every month. Your private repository is your durable persistence layer.
            </p>
          </div>

          <div className="bg-stone-900/60 border border-stone-800 rounded-2xl p-6 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Lock className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-stone-100">AES-256-GCM Encrypted at Rest</h3>
            <p className="text-xs text-stone-400 leading-relaxed">
              Every document is encrypted with authenticated AES-256-GCM using isolated per-project derived keys. GitHub only sees high-entropy ciphertext blobs.
            </p>
          </div>

          <div className="bg-stone-900/60 border border-stone-800 rounded-2xl p-6 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <GitBranch className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-stone-100">Git Blob SHA Concurrency</h3>
            <p className="text-xs text-stone-400 leading-relaxed">
              Leverage Git's cryptographic SHA hashing for optimistic locking. The API automatically rejects conflicting concurrent updates with HTTP 409.
            </p>
          </div>
        </div>
      </div>

      {/* Code Sandbox / Preview */}
      <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-stone-100">Universal Integration in 3 Lines of Code</h3>
            <p className="text-xs text-stone-400">Works in Node.js, Next.js, Cloudflare Workers, Python, and frontend clients.</p>
          </div>

          <div className="flex items-center gap-2 bg-stone-950 p-1 rounded-xl border border-stone-800">
            {(["ts", "curl", "fetch"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveCodeTab(tab)}
                className={`px-3 py-1 text-xs font-mono rounded-lg transition ${
                  activeCodeTab === tab
                    ? "bg-amber-500 text-stone-950 font-bold"
                    : "text-stone-400 hover:text-stone-200"
                }`}
              >
                {tab.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="relative">
          <pre className="bg-stone-950 border border-stone-800 rounded-xl p-4 sm:p-6 font-mono text-xs text-stone-300 overflow-x-auto leading-relaxed">
            <code>{sampleSnippet[activeCodeTab]}</code>
          </pre>

          <button
            onClick={() => handleCopy(sampleSnippet[activeCodeTab])}
            className="absolute top-3 right-3 px-3 py-1.5 bg-stone-800/80 hover:bg-stone-700 text-stone-300 text-xs font-mono rounded-lg transition flex items-center gap-1.5 border border-stone-700/50"
          >
            {copiedCode ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Realistic Boundaries & Transparency Notice */}
      <div className="bg-stone-900/40 border border-stone-800/80 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2.5 text-stone-300">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
          <h3 className="text-sm font-semibold text-stone-200">Realistic Architectural Parameters & Limits</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs text-stone-400">
          <div className="bg-stone-950/60 border border-stone-800/60 rounded-xl p-3.5 space-y-1">
            <span className="font-mono text-[11px] text-amber-400 font-semibold uppercase">API Throughput</span>
            <p className="text-stone-300">5,000 requests/hr per GitHub Personal Access Token (authenticated quota).</p>
          </div>
          <div className="bg-stone-950/60 border border-stone-800/60 rounded-xl p-3.5 space-y-1">
            <span className="font-mono text-[11px] text-emerald-400 font-semibold uppercase">Payload Sizing</span>
            <p className="text-stone-300">Supports documents up to 10MB per record in encrypted JSON envelopes.</p>
          </div>
          <div className="bg-stone-950/60 border border-stone-800/60 rounded-xl p-3.5 space-y-1">
            <span className="font-mono text-[11px] text-blue-400 font-semibold uppercase">Consistency Model</span>
            <p className="text-stone-300">Strong consistency per document via optimistic Git Blob SHA locking.</p>
          </div>
          <div className="bg-stone-950/60 border border-stone-800/60 rounded-xl p-3.5 space-y-1">
            <span className="font-mono text-[11px] text-purple-400 font-semibold uppercase">Best Suited For</span>
            <p className="text-stone-300">Indie apps, dashboards, user config storage, logs, and serverless backends.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
