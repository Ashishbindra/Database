import React, { useState, useEffect } from "react";
import { 
  ProjectItem, 
  DatabaseUsageTelemetry, 
  ProjectStatsResult 
} from "../../sdk/database/EncryptedDatabaseClient";
import { 
  Activity, 
  BarChart3, 
  Database, 
  Layers, 
  Key, 
  RefreshCw, 
  Clock, 
  ShieldCheck, 
  Server, 
  GitBranch, 
  CheckCircle2, 
  XOctagon,
  TrendingUp,
  Cpu,
  Lock
} from "lucide-react";

interface UsageStatsViewProps {
  activeProject: ProjectItem | null;
  projects: ProjectItem[];
  onFetchUsage: () => Promise<DatabaseUsageTelemetry>;
  onFetchProjectStats: (projectId: string) => Promise<ProjectStatsResult>;
}

export function UsageStatsView({
  activeProject,
  projects,
  onFetchUsage,
  onFetchProjectStats,
}: UsageStatsViewProps) {
  const [usageData, setUsageData] = useState<DatabaseUsageTelemetry | null>(null);
  const [projectStats, setProjectStats] = useState<ProjectStatsResult | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(activeProject?.projectId || (projects[0]?.projectId || ""));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAllTelemetry = async (projId = selectedProjectId) => {
    setIsLoading(true);
    setError(null);
    try {
      const usage = await onFetchUsage();
      setUsageData(usage);

      if (projId) {
        const stats = await onFetchProjectStats(projId);
        setProjectStats(stats);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load usage statistics.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (activeProject?.projectId) {
      setSelectedProjectId(activeProject.projectId);
    }
    loadAllTelemetry(activeProject?.projectId || selectedProjectId);
  }, [activeProject?.projectId]);

  const handleSelectProject = (projId: string) => {
    setSelectedProjectId(projId);
    loadAllTelemetry(projId);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-5 sm:p-6 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-amber-400" />
              <h2 className="text-base font-semibold text-stone-100">Live Usage & Telemetry</h2>
            </div>
            <p className="text-xs text-stone-400">
              Live storage consumption, collection indexes, and cryptographic security metrics.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => loadAllTelemetry()}
              disabled={isLoading}
              className="px-3.5 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-medium rounded-xl flex items-center gap-1.5 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-amber-400" : ""}`} />
              <span>Refresh Metrics</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-xl text-xs text-rose-300">
            {error}
          </div>
        )}
      </div>

      {/* Global Usage Cards */}
      {usageData && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-5 space-y-2">
            <div className="flex items-center justify-between text-stone-400">
              <span className="text-xs font-mono uppercase">Total Projects</span>
              <Layers className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-stone-100">
              {usageData.totalProjects}
            </div>
            <div className="text-[11px] text-stone-500 font-mono">
              Namespaces registered
            </div>
          </div>

          <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-5 space-y-2">
            <div className="flex items-center justify-between text-stone-400">
              <span className="text-xs font-mono uppercase">Storage Provider</span>
              <GitBranch className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-sm font-bold font-mono text-emerald-400 truncate">
              {usageData.storage.provider.toUpperCase()} / {usageData.storage.branch}
            </div>
            <div className="text-[11px] text-stone-500 font-mono truncate">
              {usageData.storage.owner}/{usageData.storage.repo}
            </div>
          </div>

          <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-5 space-y-2">
            <div className="flex items-center justify-between text-stone-400">
              <span className="text-xs font-mono uppercase">Encryption Engine</span>
              <Lock className="w-4 h-4 text-sky-400" />
            </div>
            <div className="text-sm font-bold font-mono text-sky-300 truncate">
              {usageData.security.encryption}
            </div>
            <div className="text-[11px] text-stone-500 font-mono">
              Key Derivation: {usageData.security.keyDerivation}
            </div>
          </div>

          <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-5 space-y-2">
            <div className="flex items-center justify-between text-stone-400">
              <span className="text-xs font-mono uppercase">Rate Limit Window</span>
              <Cpu className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-sm font-bold font-mono text-purple-300">
              {usageData.rateLimit ? `${usageData.rateLimit.standardLimit} req / ${usageData.rateLimit.windowMs / 1000}s` : "120 req / 60s"}
            </div>
            <div className="text-[11px] text-stone-500 font-mono">
              Per Client IP / Autonomous
            </div>
          </div>
        </div>
      )}

      {/* Project-Specific Breakdown */}
      <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-stone-100 font-mono uppercase tracking-wider">
              Project Detailed Breakdown
            </h3>
            <p className="text-xs text-stone-400">
              Collection distribution and token access timestamps for selected namespace.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-mono text-stone-400">Project:</label>
            <select
              value={selectedProjectId}
              onChange={(e) => handleSelectProject(e.target.value)}
              className="bg-stone-950 border border-stone-700 rounded-xl px-3 py-1.5 text-xs font-mono text-amber-300 focus:outline-none focus:border-amber-500"
            >
              {projects.map((p) => (
                <option key={p.projectId} value={p.projectId}>
                  {p.projectId} ({p.status})
                </option>
              ))}
            </select>
          </div>
        </div>

        {projectStats ? (
          <div className="space-y-4">
            {/* Stats Summary Chips */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-stone-950/70 border border-stone-800 rounded-xl p-3.5 space-y-1">
                <div className="text-[11px] font-mono text-stone-500 uppercase">Total Collections</div>
                <div className="text-xl font-bold font-mono text-stone-200">{projectStats.collectionsCount}</div>
              </div>

              <div className="bg-stone-950/70 border border-stone-800 rounded-xl p-3.5 space-y-1">
                <div className="text-[11px] font-mono text-stone-500 uppercase">Total Encrypted Records</div>
                <div className="text-xl font-bold font-mono text-amber-300">{projectStats.totalRecords}</div>
              </div>

              <div className="bg-stone-950/70 border border-stone-800 rounded-xl p-3.5 space-y-1">
                <div className="text-[11px] font-mono text-stone-500 uppercase">Token Last Used</div>
                <div className="text-xs font-mono text-emerald-400 truncate">
                  {projectStats.lastUsedAt ? new Date(projectStats.lastUsedAt).toLocaleString() : "Never recorded or idle"}
                </div>
              </div>
            </div>

            {/* Collection Breakdown Table */}
            <div className="border border-stone-800 rounded-xl overflow-hidden">
              <div className="p-3 bg-stone-950/80 border-b border-stone-800 font-mono text-xs font-semibold text-stone-300 flex items-center justify-between">
                <span>Collection Name</span>
                <span>Record Count</span>
              </div>
              <div className="divide-y divide-stone-800/80 bg-stone-950/40 font-mono text-xs">
                {(projectStats.collections || []).length === 0 ? (
                  <div className="p-4 text-center text-stone-500 italic">No collections created yet in this project.</div>
                ) : (
                  (projectStats.collections || []).map((colItem) => (
                    <div key={colItem.collection} className="p-3 flex items-center justify-between hover:bg-stone-900/40 transition">
                      <span className="text-stone-300 flex items-center gap-2">
                        <Database className="w-3.5 h-3.5 text-sky-400" />
                        <span>{colItem.collection}</span>
                      </span>
                      <span className="px-2 py-0.5 rounded bg-stone-900 border border-stone-800 text-amber-300 font-bold">
                        {colItem.recordCount} {colItem.recordCount === 1 ? "record" : "records"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-stone-500 font-mono text-xs">
            {isLoading ? "Loading project breakdown..." : "No project selected or stats unavailable."}
          </div>
        )}
      </div>
    </div>
  );
}
