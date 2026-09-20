import React, { useState, useEffect } from "react";
import { 
  ProjectItem, 
  RecordEnvelope, 
  RawRecordEnvelope,
  DatabaseApiError 
} from "../../sdk/database/EncryptedDatabaseClient";
import { 
  Search, 
  Plus, 
  FileEdit, 
  Trash2, 
  Code, 
  RefreshCw, 
  ShieldCheck, 
  AlertCircle, 
  CheckCircle2, 
  Copy, 
  Check, 
  Filter, 
  KeyRound, 
  FileText, 
  Folder, 
  Lock, 
  Sparkles,
  GitCommit,
  Clock,
  Layers,
  Info,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  ExternalLink,
  AlertTriangle,
  FileCode,
  X
} from "lucide-react";

interface DatabaseExplorerViewProps {
  projects: ProjectItem[];
  activeProject: ProjectItem | null;
  collections: string[];
  activeCollection: string;
  onSelectProject: (p: ProjectItem) => void;
  onSelectCollection: (col: string) => void;
  onListRecords: (col: string, filterField?: string, filterValue?: string) => Promise<RecordEnvelope[]>;
  onCreateRecord: (col: string, data: any, recordId?: string) => Promise<any>;
  onUpdateRecord: (col: string, recordId: string, data: any, expectedSha?: string) => Promise<any>;
  onDeleteRecord: (col: string, recordId: string, expectedSha?: string) => Promise<any>;
  onGetRawEnvelope: (col: string, recordId: string) => Promise<RawRecordEnvelope>;
  isLoading: boolean;
}

export function DatabaseExplorerView({
  projects,
  activeProject,
  collections,
  activeCollection,
  onSelectProject,
  onSelectCollection,
  onListRecords,
  onCreateRecord,
  onUpdateRecord,
  onDeleteRecord,
  onGetRawEnvelope,
  isLoading,
}: DatabaseExplorerViewProps) {
  const [records, setRecords] = useState<RecordEnvelope[]>([]);
  const [isFetchingRecords, setIsFetchingRecords] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterField, setFilterField] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const [isServerFilterActive, setIsServerFilterActive] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Modals & Active Record
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<RecordEnvelope | null>(null);
  const [viewingRecord, setViewingRecord] = useState<RecordEnvelope | null>(null);
  const [deletingRecord, setDeletingRecord] = useState<RecordEnvelope | null>(null);
  const [rawEnvelopeModal, setRawEnvelopeModal] = useState<{ recordId: string; envelope: RawRecordEnvelope } | null>(null);
  const [isInspectingRaw, setIsInspectingRaw] = useState(false);

  // Form State
  const [recordIdInput, setRecordIdInput] = useState("");
  const [jsonInput, setJsonInput] = useState("");
  const [expectedShaOverride, setExpectedShaOverride] = useState<string>("");
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalSuccess, setModalSuccess] = useState<string | null>(null);
  const [isConflict409, setIsConflict409] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Initial records fetch when collection or project changes
  useEffect(() => {
    setCurrentPage(1);
    if (activeProject && activeCollection) {
      loadRecords();
    } else {
      setRecords([]);
    }
  }, [activeProject?.projectId, activeCollection]);

  const loadRecords = async (useServerFilter = isServerFilterActive) => {
    if (!activeProject || !activeCollection) return;
    setIsFetchingRecords(true);
    setFetchError(null);
    try {
      const field = useServerFilter && filterField.trim() ? filterField.trim() : undefined;
      const val = useServerFilter && filterValue.trim() ? filterValue.trim() : undefined;
      const res = await onListRecords(activeCollection, field, val);
      setRecords(res);
    } catch (err: any) {
      setFetchError(err.message || "Failed to retrieve records.");
    } finally {
      setIsFetchingRecords(false);
    }
  };

  const handleApplyServerFilter = (e: React.FormEvent) => {
    e.preventDefault();
    if (filterField.trim()) {
      setIsServerFilterActive(true);
      setCurrentPage(1);
      loadRecords(true);
    }
  };

  const handleClearServerFilter = () => {
    setFilterField("");
    setFilterValue("");
    setIsServerFilterActive(false);
    setCurrentPage(1);
    if (activeProject && activeCollection) {
      setIsFetchingRecords(true);
      onListRecords(activeCollection).then((res) => {
        setRecords(res);
        setIsFetchingRecords(false);
      });
    }
  };

  const openCreateModal = () => {
    setRecordIdInput("");
    setJsonInput(
      JSON.stringify(
        {
          name: "Item Title",
          status: "active",
          email: "user@example.com",
          amount: 250,
          tags: ["encrypted", "production"],
        },
        null,
        2
      )
    );
    setModalError(null);
    setModalSuccess(null);
    setIsConflict409(false);
    setIsCreateModalOpen(true);
  };

  const openEditModal = (rec: RecordEnvelope) => {
    setEditingRecord(rec);
    setRecordIdInput(rec.recordId);
    setJsonInput(JSON.stringify(rec.data, null, 2));
    setExpectedShaOverride(rec.sha);
    setModalError(null);
    setModalSuccess(null);
    setIsConflict409(false);
  };

  const handleSaveRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    setModalSuccess(null);
    setIsConflict409(false);

    let parsedData: any;
    try {
      parsedData = JSON.parse(jsonInput);
    } catch (err) {
      setModalError("Invalid JSON syntax. Please verify commas, brackets, and quotes.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingRecord) {
        // Update with optimistic concurrency SHA
        const shaToUse = expectedShaOverride.trim() || editingRecord.sha;
        await onUpdateRecord(
          activeCollection,
          editingRecord.recordId,
          parsedData,
          shaToUse
        );
        setModalSuccess("Record updated & re-encrypted with new Git tree SHA.");
        await loadRecords();
        setTimeout(() => setEditingRecord(null), 900);
      } else {
        // Create
        const cleanId = recordIdInput.trim() || undefined;
        await onCreateRecord(activeCollection, parsedData, cleanId);
        setModalSuccess("Record created and encrypted successfully with AES-256-GCM.");
        await loadRecords();
        setTimeout(() => setIsCreateModalOpen(false), 900);
      }
    } catch (err: any) {
      if (err.status === 409 || (err.message && err.message.includes("409")) || (err.error && err.error.includes("Conflict"))) {
        setIsConflict409(true);
        setModalError("HTTP 409 Conflict: Optimistic concurrency mismatch. The record was modified by another operation. You must refresh to inspect latest SHA.");
      } else {
        setModalError(err.message || "Operation failed.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRecord = async () => {
    if (!deletingRecord) return;
    setIsSubmitting(true);
    setModalError(null);
    try {
      await onDeleteRecord(activeCollection, deletingRecord.recordId, deletingRecord.sha);
      setDeletingRecord(null);
      await loadRecords();
    } catch (err: any) {
      setModalError(err.message || "Failed to delete record.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInspectRaw = async (rec: RecordEnvelope) => {
    setIsInspectingRaw(true);
    try {
      const envelope = await onGetRawEnvelope(activeCollection, rec.recordId);
      setRawEnvelopeModal({ recordId: rec.recordId, envelope });
    } catch (err: any) {
      alert(`Failed to inspect raw envelope: ${err.message}`);
    } finally {
      setIsInspectingRaw(false);
    }
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Client-side quick filter across recordId and data payload
  const filteredRecords = records.filter((rec) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    if (rec.recordId.toLowerCase().includes(q)) return true;
    if (rec.sha.toLowerCase().includes(q)) return true;
    try {
      const jsonStr = JSON.stringify(rec.data).toLowerCase();
      return jsonStr.includes(q);
    } catch {
      return false;
    }
  });

  // Pagination calculation
  const totalFiltered = filteredRecords.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedRecords = filteredRecords.slice(startIndex, startIndex + pageSize);

  return (
    <div className="space-y-6">
      {/* Top Scope Selector Toolbar */}
      <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Project Picker */}
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-stone-500 uppercase">Target Project</label>
              <select
                value={activeProject?.projectId || ""}
                onChange={(e) => {
                  const found = projects.find((p) => p.projectId === e.target.value);
                  if (found) onSelectProject(found);
                }}
                className="bg-stone-950 border border-stone-700 rounded-xl px-3 py-1.5 text-xs font-mono text-amber-300 focus:outline-none focus:border-amber-500"
              >
                {projects.map((p) => (
                  <option key={p.projectId} value={p.projectId}>
                    {p.projectId} {(p.status === "disabled" ? "(Disabled)" : "")}
                  </option>
                ))}
              </select>
            </div>

            {/* Collection Picker */}
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-stone-500 uppercase">Collection</label>
              {collections.length > 0 ? (
                <select
                  value={activeCollection}
                  onChange={(e) => onSelectCollection(e.target.value)}
                  className="bg-stone-950 border border-stone-700 rounded-xl px-3 py-1.5 text-xs font-mono text-sky-300 focus:outline-none focus:border-sky-500"
                >
                  {collections.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-xs font-mono text-stone-500 italic py-1.5">No collections yet</div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 self-end md:self-auto">
            <button
              onClick={() => loadRecords()}
              disabled={isFetchingRecords || !activeCollection}
              className="p-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-xl transition"
              title="Refresh records"
            >
              <RefreshCw className={`w-4 h-4 ${isFetchingRecords ? "animate-spin text-amber-400" : ""}`} />
            </button>

            <button
              onClick={openCreateModal}
              disabled={!activeCollection || activeProject?.status === "disabled"}
              className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 text-xs font-medium rounded-xl flex items-center gap-1.5 transition font-mono"
            >
              <Plus className="w-4 h-4" />
              <span>Create Record</span>
            </button>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="pt-3 border-t border-stone-800/80 grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Client Live Search */}
          <div className="md:col-span-6 relative">
            <Search className="w-3.5 h-3.5 text-stone-500 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search records by ID, content, or SHA..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-stone-950 border border-stone-800 rounded-xl pl-9 pr-3 py-2 text-xs text-stone-200 placeholder-stone-500 focus:outline-none focus:border-amber-500/80 font-mono"
            />
          </div>

          {/* Server-Side Key-Value Filter */}
          <form onSubmit={handleApplyServerFilter} className="md:col-span-6 flex items-center gap-2">
            <input
              type="text"
              placeholder="Field name (e.g. status)"
              value={filterField}
              onChange={(e) => setFilterField(e.target.value)}
              className="w-1/2 bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-200 placeholder-stone-500 focus:outline-none focus:border-sky-500/80 font-mono"
            />
            <input
              type="text"
              placeholder="Value (e.g. active)"
              value={filterValue}
              onChange={(e) => setFilterValue(e.target.value)}
              className="w-1/2 bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-200 placeholder-stone-500 focus:outline-none focus:border-sky-500/80 font-mono"
            />
            <button
              type="submit"
              disabled={!filterField.trim()}
              className="px-3 py-2 bg-stone-800 hover:bg-stone-700 disabled:opacity-40 text-stone-200 text-xs rounded-xl font-mono transition"
            >
              Filter
            </button>
            {isServerFilterActive && (
              <button
                type="button"
                onClick={handleClearServerFilter}
                className="px-2.5 py-2 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 text-xs rounded-xl font-mono transition"
              >
                Clear
              </button>
            )}
          </form>
        </div>
      </div>

      {/* Records Table & Visual Cards */}
      <div className="bg-stone-900/80 border border-stone-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 bg-stone-950/60 border-b border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-semibold text-stone-200 font-mono uppercase tracking-wider">
              {activeCollection ? `Collection: ${activeCollection}` : "Records"}
            </h3>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-stone-800 text-stone-400">
              {totalFiltered} {totalFiltered === 1 ? "record" : "records"}
            </span>
          </div>

          {/* Page size selector */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-stone-500">Per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-stone-950 border border-stone-800 rounded-lg px-2 py-1 text-[11px] font-mono text-stone-300"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>

        {fetchError && (
          <div className="p-4 bg-rose-950/30 border-b border-rose-800/40 text-xs text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{fetchError}</span>
          </div>
        )}

        {isFetchingRecords ? (
          <div className="p-12 text-center space-y-3">
            <RefreshCw className="w-6 h-6 text-amber-400 animate-spin mx-auto" />
            <p className="text-xs font-mono text-stone-400">Decrypting records from GitHub tree...</p>
          </div>
        ) : paginatedRecords.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Folder className="w-8 h-8 text-stone-600 mx-auto" />
            <p className="text-xs font-medium text-stone-300">No records found in this view</p>
            <p className="text-xs text-stone-500 max-w-sm mx-auto font-mono">
              {searchQuery || isServerFilterActive
                ? "No records match the current search or filter query."
                : "Create your first encrypted JSON document using the button above."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-stone-800/80">
            {paginatedRecords.map((rec) => (
              <div key={rec.recordId} className="p-4 hover:bg-stone-950/40 transition space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-amber-300">
                      {rec.recordId}
                    </span>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-stone-950 border border-stone-800 text-stone-400 flex items-center gap-1">
                      <GitCommit className="w-3 h-3 text-stone-500" />
                      <span>{rec.sha.slice(0, 7)}</span>
                    </span>
                    {rec.updatedAt && (
                      <span className="text-[11px] text-stone-500 font-mono hidden md:inline">
                        {new Date(rec.updatedAt).toLocaleTimeString()}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 self-end sm:self-auto">
                    <button
                      onClick={() => setViewingRecord(rec)}
                      className="px-2.5 py-1 bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs rounded-lg font-mono transition"
                      title="View formatted JSON"
                    >
                      View
                    </button>
                    <button
                      onClick={() => handleInspectRaw(rec)}
                      className="px-2.5 py-1 bg-stone-800 hover:bg-stone-700 text-emerald-400 text-xs rounded-lg font-mono transition flex items-center gap-1"
                      title="Inspect raw AES-256-GCM ciphertext on GitHub"
                    >
                      <Lock className="w-3 h-3" />
                      <span>Raw</span>
                    </button>
                    <button
                      onClick={() => openEditModal(rec)}
                      className="px-2.5 py-1 bg-stone-800 hover:bg-stone-700 text-amber-300 text-xs rounded-lg font-mono transition flex items-center gap-1"
                      title="Edit record"
                    >
                      <FileEdit className="w-3 h-3" />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={() => setDeletingRecord(rec)}
                      className="p-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 text-xs rounded-lg transition"
                      title="Delete record"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* JSON preview preview snippet */}
                <div className="bg-stone-950 border border-stone-800/80 rounded-xl p-3 font-mono text-xs text-stone-300 overflow-x-auto max-h-36 scrollbar-thin">
                  <pre>{JSON.stringify(rec.data, null, 2)}</pre>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="p-4 bg-stone-950/60 border-t border-stone-800 flex items-center justify-between text-xs font-mono text-stone-400">
            <div>
              Showing {startIndex + 1} - {Math.min(startIndex + pageSize, totalFiltered)} of {totalFiltered}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 bg-stone-800 hover:bg-stone-700 disabled:opacity-30 rounded-lg text-stone-200 transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="text-stone-300">
                Page {currentPage} / {totalPages}
              </span>

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 bg-stone-800 hover:bg-stone-700 disabled:opacity-30 rounded-lg text-stone-200 transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Record Modal */}
      {(isCreateModalOpen || editingRecord) && (
        <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <FileCode className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-semibold text-stone-100">
                  {editingRecord ? `Edit Record: ${editingRecord.recordId}` : `Create Record in '${activeCollection}'`}
                </h3>
              </div>
              <button
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setEditingRecord(null);
                }}
                className="p-1 hover:bg-stone-800 rounded-lg text-stone-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-xl text-xs text-rose-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div>{modalError}</div>
                  {isConflict409 && (
                    <button
                      type="button"
                      onClick={() => loadRecords()}
                      className="px-2 py-1 bg-amber-500 text-stone-950 rounded text-[11px] font-mono font-bold"
                    >
                      Fetch Fresh Record SHA
                    </button>
                  )}
                </div>
              </div>
            )}

            {modalSuccess && (
              <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>{modalSuccess}</span>
              </div>
            )}

            <form onSubmit={handleSaveRecord} className="space-y-4">
              {!editingRecord && (
                <div className="space-y-1">
                  <label className="text-xs font-mono text-stone-400">
                    Record ID (Optional - Auto-generated if left empty)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. inv_2026_001 (1-128 alphanumeric, hyphens, underscores)"
                    value={recordIdInput}
                    onChange={(e) => setRecordIdInput(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs font-mono text-stone-200 focus:outline-none focus:border-amber-500"
                  />
                </div>
              )}

              {editingRecord && (
                <div className="space-y-1 bg-stone-950/60 border border-stone-800 p-3 rounded-xl">
                  <label className="text-[11px] font-mono text-stone-400 flex items-center justify-between">
                    <span>OPTIMISTIC CONCURRENCY SHA</span>
                    <span className="text-stone-500 font-normal">Prevents lost updates</span>
                  </label>
                  <input
                    type="text"
                    value={expectedShaOverride}
                    onChange={(e) => setExpectedShaOverride(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-amber-300 focus:outline-none focus:border-amber-500"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-mono text-stone-400 flex items-center justify-between">
                  <span>JSON Payload Body</span>
                  <span className="text-[11px] text-stone-500 font-normal">Encrypted with AES-256-GCM before writing to GitHub</span>
                </label>
                <textarea
                  rows={9}
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl p-3 text-xs font-mono text-emerald-300 focus:outline-none focus:border-amber-500 scrollbar-thin"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateModalOpen(false);
                    setEditingRecord(null);
                  }}
                  className="px-4 py-2 text-xs text-stone-400 hover:text-stone-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-medium text-xs rounded-xl transition flex items-center gap-1.5 font-mono"
                >
                  {isSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingRecord ? "Save Changes" : "Create Record"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Formatted Record Modal */}
      {viewingRecord && (
        <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <h3 className="text-base font-semibold text-stone-100 font-mono">
                  {viewingRecord.recordId}
                </h3>
                <p className="text-xs font-mono text-stone-400">
                  SHA: <span className="text-amber-300">{viewingRecord.sha}</span>
                </p>
              </div>
              <button onClick={() => setViewingRecord(null)} className="p-1 hover:bg-stone-800 rounded-lg text-stone-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-stone-950 border border-stone-800 rounded-xl p-4 font-mono text-xs text-stone-300 overflow-x-auto max-h-96 scrollbar-thin">
              <pre>{JSON.stringify(viewingRecord.data, null, 2)}</pre>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => handleCopy(JSON.stringify(viewingRecord.data, null, 2), "viewing_json")}
                className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs rounded-xl font-mono flex items-center gap-1.5 transition"
              >
                {copiedKey === "viewing_json" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>Copy JSON</span>
              </button>
              <button
                type="button"
                onClick={() => setViewingRecord(null)}
                className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs rounded-xl transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Raw Envelope Modal */}
      {rawEnvelopeModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-semibold text-stone-100">
                  Raw GitHub Encrypted Envelope
                </h3>
              </div>
              <button onClick={() => setRawEnvelopeModal(null)} className="p-1 hover:bg-stone-800 rounded-lg text-stone-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-stone-400">
              This is the literal AES-256-GCM encrypted envelope stored on GitHub tree. Zero plaintext is ever written to Git.
            </p>

            <div className="bg-stone-950 border border-stone-800 rounded-xl p-4 font-mono text-xs text-amber-300 overflow-x-auto max-h-72 scrollbar-thin">
              <pre>{JSON.stringify(rawEnvelopeModal.envelope, null, 2)}</pre>
            </div>

            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => setRawEnvelopeModal(null)}
                className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs rounded-xl transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Record Confirmation */}
      {deletingRecord && (
        <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <Trash2 className="w-6 h-6" />
              <h3 className="text-base font-semibold text-stone-100">Delete Record?</h3>
            </div>
            <p className="text-xs text-stone-300 leading-relaxed">
              Are you sure you want to delete record <span className="font-mono text-amber-300 font-semibold">{deletingRecord.recordId}</span>? This will remove the encrypted blob from the GitHub repository tree.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingRecord(null)}
                className="px-4 py-2 text-xs text-stone-400 hover:text-stone-200 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteRecord}
                disabled={isSubmitting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-stone-100 font-medium text-xs rounded-xl transition flex items-center gap-1.5 font-mono"
              >
                {isSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
