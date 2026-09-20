import React, { useState } from "react";
import { ProjectItem } from "../../sdk/database/EncryptedDatabaseClient";
import { 
  FolderPlus, 
  Folder, 
  Trash2, 
  Database, 
  ArrowRight, 
  AlertTriangle, 
  CheckCircle2, 
  Layers,
  Sparkles,
  Search
} from "lucide-react";

interface CollectionsManagerViewProps {
  activeProject: ProjectItem | null;
  collections: string[];
  collectionCounts: Record<string, number>;
  onSelectCollection: (col: string) => void;
  onCreateCollection: (col: string) => Promise<void>;
  onDeleteCollection: (col: string) => Promise<void>;
  onNavigateToExplorer: () => void;
  isLoading: boolean;
}

export function CollectionsManagerView({
  activeProject,
  collections,
  collectionCounts,
  onSelectCollection,
  onCreateCollection,
  onDeleteCollection,
  onNavigateToExplorer,
  isLoading,
}: CollectionsManagerViewProps) {
  const [newCollectionName, setNewCollectionName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteInputText, setDeleteInputText] = useState("");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newCollectionName.trim();
    if (!cleanName) return;

    if (!/^[a-zA-Z0-9_-]+$/.test(cleanName)) {
      setErrorMsg("Collection name can only contain letters, numbers, underscores, and dashes.");
      return;
    }

    if (cleanName.length > 64) {
      setErrorMsg("Collection name must be 64 characters or fewer.");
      return;
    }

    setErrorMsg(null);
    setIsCreating(true);
    try {
      await onCreateCollection(cleanName);
      setNewCollectionName("");
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to create collection.");
    } finally {
      setIsCreating(false);
    }
  };

  if (!activeProject) {
    return (
      <div className="bg-stone-900/40 border border-stone-800 rounded-2xl p-12 text-center space-y-3">
        <Database className="w-8 h-8 text-stone-600 mx-auto" />
        <h3 className="text-sm font-medium text-stone-300">No Project Selected</h3>
        <p className="text-xs text-stone-500 max-w-sm mx-auto">
          Please select a project from the Projects tab before creating or managing collections.
        </p>
      </div>
    );
  }

  const filteredCollections = collections.filter((c) =>
    c.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Creation & Controls Header */}
      <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
              <h2 className="text-lg font-semibold text-stone-100">
                Collections for <span className="font-mono text-amber-300">{activeProject.projectId}</span>
              </h2>
            </div>
            <p className="text-sm text-stone-400 max-w-2xl">
              Collections group encrypted document records. Each record within a collection is signed, authenticated, and persisted with its own Git SHA.
            </p>
          </div>

          {/* New Collection Form */}
          <form onSubmit={handleCreate} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="text"
              value={newCollectionName}
              onChange={(e) => {
                setNewCollectionName(e.target.value);
                setErrorMsg(null);
              }}
              placeholder="e.g. customers, orders"
              className="w-full sm:w-56 bg-stone-950 border border-stone-700/80 focus:border-sky-500/80 rounded-xl px-3.5 py-2 text-xs font-mono text-stone-200 placeholder-stone-600 focus:outline-none transition"
            />
            <button
              type="submit"
              disabled={isCreating || !newCollectionName.trim() || isLoading}
              className="px-4 py-2 bg-sky-500 hover:bg-sky-400 disabled:bg-stone-800 disabled:text-stone-600 text-stone-950 font-medium text-xs rounded-xl flex items-center justify-center gap-1.5 transition shadow-sm"
            >
              {isCreating ? (
                <div className="w-4 h-4 border-2 border-stone-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <FolderPlus className="w-4 h-4" />
              )}
              <span>Create Collection</span>
            </button>
          </form>
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-xl text-xs text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Collections Listing */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-1">
          <div className="flex items-center gap-2 text-xs font-mono text-stone-400">
            <Layers className="w-4 h-4 text-sky-400" />
            <span>COLLECTIONS ({collections.length})</span>
          </div>

          {collections.length > 0 && (
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter collections..."
                className="w-full bg-stone-900/90 border border-stone-800 focus:border-stone-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-stone-200 placeholder-stone-600 focus:outline-none"
              />
            </div>
          )}
        </div>

        {collections.length === 0 ? (
          <div className="bg-stone-900/40 border border-stone-800/80 border-dashed rounded-2xl p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-stone-800/60 flex items-center justify-center mx-auto text-stone-500">
              <Folder className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-stone-300">No Collections in this Project</h3>
              <p className="text-xs text-stone-500 max-w-md mx-auto">
                Create your first collection name (e.g. <span className="font-mono text-stone-400">customers</span>, <span className="font-mono text-stone-400">documents</span>, or <span className="font-mono text-stone-400">orders</span>) above to begin storing records.
              </p>
            </div>
          </div>
        ) : filteredCollections.length === 0 ? (
          <div className="bg-stone-900/40 border border-stone-800 rounded-2xl p-8 text-center text-xs text-stone-500 font-mono">
            No collections match filter "{searchQuery}".
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCollections.map((col) => {
              const count = collectionCounts[col] ?? 0;

              return (
                <div
                  key={col}
                  className="bg-stone-900/70 border border-stone-800/80 hover:border-stone-700 rounded-2xl p-5 space-y-4 transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                        <Folder className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-mono text-sm font-semibold text-stone-100">{col}</h4>
                        <span className="text-[11px] font-mono text-stone-500">
                          {count} {count === 1 ? "record" : "records"}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => setDeleteTarget(col)}
                      title={`Delete collection '${col}'`}
                      disabled={isLoading}
                      className="p-1.5 rounded-lg border border-stone-800 bg-stone-900 hover:bg-rose-950/40 hover:border-rose-800/60 text-stone-500 hover:text-rose-300 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="pt-2 border-t border-stone-800/80 flex items-center justify-between">
                    <span className="text-[11px] font-mono text-stone-500">
                      /collections/{col}/
                    </span>
                    <button
                      onClick={() => {
                        onSelectCollection(col);
                        onNavigateToExplorer();
                      }}
                      className="px-3 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 text-xs font-medium rounded-xl flex items-center gap-1.5 transition"
                    >
                      <span>Explore Records</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Collection Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-stone-100">Delete Collection?</h3>
                <p className="text-xs text-stone-400 font-mono">{deleteTarget}</p>
              </div>
            </div>

            <p className="text-xs text-stone-300 leading-relaxed">
              This action will permanently delete collection <span className="font-mono text-rose-300 font-bold">{deleteTarget}</span> and remove all encrypted record blobs under this path.
            </p>

            <div className="space-y-1.5">
              <label className="text-[11px] font-mono text-stone-400">
                Type <span className="text-rose-400 font-bold">{deleteTarget}</span> to confirm:
              </label>
              <input
                type="text"
                value={deleteInputText}
                onChange={(e) => setDeleteInputText(e.target.value)}
                placeholder={deleteTarget}
                className="w-full bg-stone-950 border border-stone-700 focus:border-rose-500 rounded-xl px-3 py-2 text-xs font-mono text-stone-200 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteInputText("");
                }}
                className="px-4 py-2 text-xs text-stone-400 hover:text-stone-200 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteInputText !== deleteTarget || isLoading}
                onClick={async () => {
                  if (deleteTarget) {
                    await onDeleteCollection(deleteTarget);
                    setDeleteTarget(null);
                    setDeleteInputText("");
                  }
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:bg-stone-800 disabled:text-stone-600 text-stone-100 font-medium text-xs rounded-xl transition flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Collection</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
