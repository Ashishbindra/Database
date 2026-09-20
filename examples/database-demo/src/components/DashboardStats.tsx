import React from "react";
import { Database, FolderTree, FileText, ShieldCheck, Activity } from "lucide-react";

interface DashboardStatsProps {
  isConnected: boolean;
  isChecking: boolean;
  projectId: string;
  collectionName: string;
  collectionCount: number;
  recordCount: number;
  onOpenConfig: () => void;
}

export const DashboardStats: React.FC<DashboardStatsProps> = ({
  isConnected,
  isChecking,
  projectId,
  collectionName,
  collectionCount,
  recordCount,
  onOpenConfig,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Connection Status Card */}
      <div
        id="status-connection-card"
        className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-sm shadow-sm flex flex-col justify-between"
      >
        <div className="flex items-center justify-between text-slate-400">
          <span className="text-xs font-medium uppercase tracking-wider">Database Status</span>
          <Activity className="w-4 h-4 text-slate-500" />
        </div>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span
              className={`w-3 h-3 rounded-full animate-pulse ${
                isConnected ? "bg-emerald-500 shadow-lg shadow-emerald-500/50" : "bg-rose-500 shadow-lg shadow-rose-500/50"
              }`}
            />
            <span className="font-semibold text-base text-slate-100">
              {isChecking ? "Connecting..." : isConnected ? "Connected" : "Disconnected"}
            </span>
          </div>
          <button
            id="configure-connection-button"
            onClick={onOpenConfig}
            className="text-xs text-sky-400 hover:text-sky-300 underline font-medium"
          >
            Settings
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-2 truncate">Production API: Vercel Cloud</p>
      </div>

      {/* Project ID Card */}
      <div
        id="status-project-card"
        className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-sm shadow-sm flex flex-col justify-between"
      >
        <div className="flex items-center justify-between text-slate-400">
          <span className="text-xs font-medium uppercase tracking-wider">Active Project</span>
          <Database className="w-4 h-4 text-sky-400" />
        </div>
        <div className="mt-4">
          <span className="font-mono text-sm font-semibold text-slate-200 block truncate" title={projectId || "No project selected"}>
            {projectId || "Not Selected"}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-emerald-400/90 mt-2">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>AES-GCM-256 Protected</span>
        </div>
      </div>

      {/* Collections Count Card */}
      <div
        id="status-collections-card"
        className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-sm shadow-sm flex flex-col justify-between"
      >
        <div className="flex items-center justify-between text-slate-400">
          <span className="text-xs font-medium uppercase tracking-wider">Collections</span>
          <FolderTree className="w-4 h-4 text-indigo-400" />
        </div>
        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-2xl font-bold text-slate-100">{collectionCount}</span>
          <span className="text-xs text-slate-400">active ({collectionName})</span>
        </div>
        <p className="text-xs text-slate-500 mt-2">Isolated namespace partition</p>
      </div>

      {/* Total Records Card */}
      <div
        id="status-records-card"
        className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-sm shadow-sm flex flex-col justify-between"
      >
        <div className="flex items-center justify-between text-slate-400">
          <span className="text-xs font-medium uppercase tracking-wider">Total Records</span>
          <FileText className="w-4 h-4 text-teal-400" />
        </div>
        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-2xl font-bold text-slate-100">{recordCount}</span>
          <span className="text-xs text-slate-400">in {collectionName}</span>
        </div>
        <p className="text-xs text-slate-500 mt-2">Backed by GitHub commit history</p>
      </div>
    </div>
  );
};
