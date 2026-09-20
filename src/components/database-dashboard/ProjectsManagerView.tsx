import React, { useState } from "react";
import { ProjectItem } from "../../sdk/database/EncryptedDatabaseClient";
import { 
  FolderPlus, 
  Shield, 
  Key, 
  Trash2, 
  Power, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Copy, 
  Check, 
  ArrowRight,
  Database,
  Layers,
  AlertTriangle
} from "lucide-react";

interface ProjectsManagerViewProps {
  projects: ProjectItem[];
  activeProject: ProjectItem | null;
  onSelectProject: (project: ProjectItem) => void;
  onCreateProject: (projectId: string) => Promise<any>;
  onToggleStatus: (projectId: string, currentStatus: "active" | "disabled") => Promise<void>;
  onRotateToken: (projectId: string) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
  onNavigateToExplorer: () => void;
  isLoading: boolean;
}

export function ProjectsManagerView({
  projects,
  activeProject,
  onSelectProject,
  onCreateProject,
  onToggleStatus,
  onRotateToken,
  onDeleteProject,
  onNavigateToExplorer,
  isLoading,
}: ProjectsManagerViewProps) {
  const [newProjectId, setNewProjectId] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteConfirmProject, setDeleteConfirmProject] = useState<string | null>(null);
  const [deleteInputText, setDeleteInputText] = useState("");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = newProjectId.trim();
    if (!cleanId) return;

    if (!/^[a-zA-Z0-9_-]+$/.test(cleanId)) {
      setErrorMsg("Project ID can only contain alphanumeric characters, underscores, and dashes.");
      return;
    }

    setErrorMsg(null);
    setIsCreating(true);
    try {
      await onCreateProject(cleanId);
      setNewProjectId("");
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to create project.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Create */}
      <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <h2 className="text-lg font-semibold text-stone-100">Encrypted Database Projects</h2>
            </div>
            <p className="text-sm text-stone-400 max-w-2xl">
              Each project is an isolated, AES-256-GCM encrypted database namespace backed by GitHub git tree storage with zero backend operational costs.
            </p>
          </div>

          {/* Quick Create Form */}
          <form onSubmit={handleCreate} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative">
              <input
                type="text"
                value={newProjectId}
                onChange={(e) => {
                  setNewProjectId(e.target.value);
                  setErrorMsg(null);
                }}
                placeholder="e.g. ecommerce_production"
                className="w-full sm:w-64 bg-stone-950 border border-stone-700/80 focus:border-amber-500/80 rounded-xl px-3.5 py-2 text-xs font-mono text-stone-200 placeholder-stone-600 focus:outline-none transition"
              />
            </div>
            <button
              type="submit"
              disabled={isCreating || !newProjectId.trim() || isLoading}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-stone-800 disabled:text-stone-600 text-stone-950 font-medium text-xs rounded-xl flex items-center justify-center gap-1.5 transition shadow-sm"
            >
              {isCreating ? (
                <div className="w-4 h-4 border-2 border-stone-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <FolderPlus className="w-4 h-4" />
              )}
              <span>Create Project</span>
            </button>
          </form>
        </div>

        {errorMsg && (
          <div className="mt-4 p-3 bg-rose-950/40 border border-rose-800/60 rounded-xl text-xs text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Projects Grid / List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2 text-xs font-mono text-stone-400">
            <Layers className="w-4 h-4 text-amber-400" />
            <span>PROJECT DIRECTORY ({projects.length})</span>
          </div>
          {activeProject && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-stone-500">Active Scope:</span>
              <span className="font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                {activeProject.projectId}
              </span>
            </div>
          )}
        </div>

        {projects.length === 0 ? (
          <div className="bg-stone-900/40 border border-stone-800/80 border-dashed rounded-2xl p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-stone-800/60 flex items-center justify-center mx-auto text-stone-500">
              <Database className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-stone-300">No Database Projects Created Yet</h3>
              <p className="text-xs text-stone-500 max-w-md mx-auto">
                Create your first project namespace above to begin creating encrypted collections and managing structured records.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((proj) => {
              const isSelected = activeProject?.projectId === proj.projectId;
              const isActive = (proj.status || "active") === "active";

              return (
                <div
                  key={proj.projectId}
                  className={`bg-stone-900/70 border rounded-2xl p-5 space-y-4 transition ${
                    isSelected
                      ? "border-amber-500/60 shadow-[0_0_20px_rgba(245,158,11,0.08)] bg-stone-900/90"
                      : "border-stone-800/80 hover:border-stone-700"
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-stone-100">
                          {proj.projectId}
                        </span>
                        {isSelected && (
                          <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 bg-amber-500/20 text-amber-300 rounded border border-amber-500/30">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-stone-500 font-mono">
                        <Clock className="w-3 h-3" />
                        <span>
                          {proj.createdAt ? new Date(proj.createdAt).toLocaleDateString() : "Active Project"}
                        </span>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div className="flex items-center gap-1.5">
                      {isActive ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Active</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          <XCircle className="w-3 h-3" />
                          <span>Disabled</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Project ID Copy Line */}
                  <div className="bg-stone-950/70 border border-stone-800/80 rounded-xl p-2.5 flex items-center justify-between text-xs font-mono">
                    <span className="text-stone-400 truncate text-[11px]">
                      ID: <span className="text-stone-200">{proj.projectId}</span>
                    </span>
                    <button
                      onClick={() => handleCopy(proj.projectId, `id-${proj.projectId}`)}
                      title="Copy Project ID"
                      className="p-1 hover:bg-stone-800 rounded text-stone-400 hover:text-stone-200 transition flex-shrink-0"
                    >
                      {copiedId === `id-${proj.projectId}` ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Action Controls */}
                  <div className="pt-2 border-t border-stone-800/80 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      {/* Toggle Status */}
                      <button
                        onClick={() => onToggleStatus(proj.projectId, proj.status || "active")}
                        title={isActive ? "Disable Project" : "Enable Project"}
                        disabled={isLoading}
                        className={`p-1.5 rounded-lg border text-xs transition ${
                          isActive
                            ? "border-stone-700 bg-stone-800/50 hover:bg-rose-950/40 hover:border-rose-800/60 text-stone-400 hover:text-rose-300"
                            : "border-emerald-800/60 bg-emerald-950/30 hover:bg-emerald-950/60 text-emerald-400"
                        }`}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>

                      {/* Delete Project */}
                      <button
                        onClick={() => setDeleteConfirmProject(proj.projectId)}
                        title="Delete Project and Storage"
                        disabled={isLoading}
                        className="p-1.5 rounded-lg border border-stone-700 bg-stone-800/50 hover:bg-rose-950/40 hover:border-rose-800/60 text-stone-400 hover:text-rose-300 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Select / Explore CTA */}
                    <button
                      onClick={() => {
                        onSelectProject(proj);
                        if (isSelected) {
                          onNavigateToExplorer();
                        }
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition ${
                        isSelected
                          ? "bg-amber-500 hover:bg-amber-400 text-stone-950"
                          : "bg-stone-800 hover:bg-stone-700 text-stone-200"
                      }`}
                    >
                      <span>{isSelected ? "Open Explorer" : "Select Project"}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmProject && (
        <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-stone-100">Delete Project?</h3>
                <p className="text-xs text-stone-400 font-mono">{deleteConfirmProject}</p>
              </div>
            </div>

            <p className="text-xs text-stone-300 leading-relaxed">
              This action will permanently delete this project and clean up all associated encrypted collections and records from GitHub storage. This cannot be undone.
            </p>

            <div className="space-y-1.5">
              <label className="text-[11px] font-mono text-stone-400">
                Type <span className="text-rose-400 font-bold">{deleteConfirmProject}</span> to confirm:
              </label>
              <input
                type="text"
                value={deleteInputText}
                onChange={(e) => setDeleteInputText(e.target.value)}
                placeholder={deleteConfirmProject}
                className="w-full bg-stone-950 border border-stone-700 focus:border-rose-500 rounded-xl px-3 py-2 text-xs font-mono text-stone-200 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirmProject(null);
                  setDeleteInputText("");
                }}
                className="px-4 py-2 rounded-xl text-xs text-stone-400 hover:text-stone-200 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteInputText !== deleteConfirmProject || isLoading}
                onClick={async () => {
                  if (deleteConfirmProject) {
                    await onDeleteProject(deleteConfirmProject);
                    setDeleteConfirmProject(null);
                    setDeleteInputText("");
                  }
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:bg-stone-800 disabled:text-stone-600 text-stone-100 font-medium text-xs rounded-xl transition flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Permanently Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
