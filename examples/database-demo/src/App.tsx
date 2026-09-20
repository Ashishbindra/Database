import React, { useState, useEffect, useCallback } from "react";
import {
  Users,
  Plus,
  RefreshCw,
  Search,
  Filter,
  Shield,
  Layers,
  Database,
  ExternalLink,
} from "lucide-react";
import { EncryptedDatabaseClient, DatabaseApiError } from "./client/EncryptedDatabaseClient";
import { Customer, CustomerRecord, ApiAlert } from "./types";
import { DashboardStats } from "./components/DashboardStats";
import { CustomerTable } from "./components/CustomerTable";
import { CustomerModal } from "./components/CustomerModal";
import { ConfigModal } from "./components/ConfigModal";
import { AlertBanner } from "./components/AlertBanner";

const DEFAULT_PROD_URL = "https://github-encrypted-vault.vercel.app";
const DEFAULT_COLLECTION = "customers";

export const App: React.FC = () => {
  // Config state
  const [baseUrl, setBaseUrl] = useState(() => localStorage.getItem("demo_db_url") || DEFAULT_PROD_URL);
  const [projectId, setProjectId] = useState(() => localStorage.getItem("demo_project_id") || "");
  const [projectToken, setProjectToken] = useState(() => localStorage.getItem("demo_project_token") || "");
  const [userSessionToken, setUserSessionToken] = useState(() => localStorage.getItem("demo_session_token") || "");
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  // App data state
  const [records, setRecords] = useState<CustomerRecord[]>([]);
  const [collections, setCollections] = useState<string[]>([DEFAULT_COLLECTION]);
  const [selectedCollection, setSelectedCollection] = useState(DEFAULT_COLLECTION);
  const [isConnected, setIsConnected] = useState(false);
  const [isCheckingConnection, setIsCheckingConnection] = useState(false);

  // Filters & search
  const [searchTerm, setSearchTerm] = useState("");
  const [searchField, setSearchField] = useState<"name" | "email" | "phone">("name");

  // UI state
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<CustomerRecord | null>(null);
  const [alert, setAlert] = useState<ApiAlert | null>(null);

  // Helper to construct client
  const getClient = useCallback(() => {
    return new EncryptedDatabaseClient({
      baseUrl,
      projectId: projectId || undefined,
      projectToken: projectToken || undefined,
      userSessionToken: userSessionToken || undefined,
    });
  }, [baseUrl, projectId, projectToken, userSessionToken]);

  // Handle errors and map status codes to friendly user messages
  const handleApiError = useCallback((err: any, fallbackTitle: string) => {
    console.error(fallbackTitle, err);
    let status = err.status || 0;
    let title = fallbackTitle;
    let message = err.message || "An unexpected error occurred.";

    if (err instanceof DatabaseApiError || err.status) {
      status = err.status;
      switch (status) {
        case 401:
          title = "Authentication Required (401)";
          message = "Invalid or expired Project API Token. Please check your credentials in Settings.";
          break;
        case 403:
          title = "Access Forbidden (403)";
          message = "Cross-project isolation policy prevented access. This token does not own the requested project.";
          break;
        case 404:
          title = "Resource Not Found (404)";
          message = "The requested record, collection, or project does not exist in storage.";
          break;
        case 409:
          title = "Optimistic Concurrency Conflict (409)";
          message = "The record was updated by another client or has a mismatched commit SHA. Refreshing records...";
          break;
        case 500:
        case 502:
        case 503:
          title = `Server / Storage Unavailable (${status})`;
          message = "The production backend or GitHub repository storage is currently unreachable.";
          break;
        default:
          title = `Database Error (${status || "Network"})`;
          break;
      }
    }

    setAlert({ type: "error", title, message, status });
  }, []);

  // Check connection and fetch collections
  const checkConnection = useCallback(async () => {
    setIsCheckingConnection(true);
    const client = getClient();

    try {
      // 1. Health check
      await client.checkHealth();

      // 2. If project configured, verify collections
      if (projectId && projectToken) {
        const cols = await client.listCollections().catch(() => [DEFAULT_COLLECTION]);
        setCollections(cols.length > 0 ? cols : [DEFAULT_COLLECTION]);
      }
      setIsConnected(true);
    } catch (err: any) {
      setIsConnected(false);
      // Only alert if we actually attempted with credentials
      if (projectId && projectToken) {
        handleApiError(err, "Database Connection Failed");
      }
    } finally {
      setIsCheckingConnection(false);
    }
  }, [getClient, projectId, projectToken, handleApiError]);

  // Load records
  const loadRecords = useCallback(
    async (field?: string, value?: string) => {
      if (!projectId || !projectToken) {
        return;
      }

      setIsLoadingRecords(true);
      const client = getClient();

      try {
        const filterOpts = field && value?.trim() ? { filterField: field, filterValue: value.trim() } : undefined;
        const result = await client.listRecords<Customer>(selectedCollection, filterOpts);
        setRecords(result);
        setIsConnected(true);
      } catch (err: any) {
        handleApiError(err, "Failed to load customer records");
      } finally {
        setIsLoadingRecords(false);
      }
    },
    [getClient, projectId, projectToken, selectedCollection, handleApiError]
  );

  // Initial load
  useEffect(() => {
    checkConnection();
    if (projectId && projectToken) {
      loadRecords();
    } else {
      // Prompt user to configure
      setIsConfigOpen(true);
    }
  }, []); // Run on mount

  // Refresh records on collection change
  useEffect(() => {
    if (projectId && projectToken) {
      loadRecords(searchTerm ? searchField : undefined, searchTerm || undefined);
    }
  }, [selectedCollection]);

  // Handle Search Submission
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadRecords(searchTerm ? searchField : undefined, searchTerm || undefined);
  };

  const handleClearSearch = () => {
    setSearchTerm("");
    loadRecords();
  };

  // Save Config
  const handleSaveConfig = (cfg: {
    baseUrl: string;
    projectId: string;
    projectToken: string;
    userSessionToken: string;
  }) => {
    setBaseUrl(cfg.baseUrl);
    setProjectId(cfg.projectId);
    setProjectToken(cfg.projectToken);
    setUserSessionToken(cfg.userSessionToken);

    localStorage.setItem("demo_db_url", cfg.baseUrl);
    localStorage.setItem("demo_project_id", cfg.projectId);
    localStorage.setItem("demo_project_token", cfg.projectToken);
    localStorage.setItem("demo_session_token", cfg.userSessionToken);

    setAlert({
      type: "success",
      title: "Settings Saved",
      message: `Connected to project "${cfg.projectId}" on ${cfg.baseUrl}`,
    });

    setTimeout(() => {
      checkConnection();
      loadRecords();
    }, 100);
  };

  // Save Customer (Create or Update)
  const handleSaveCustomer = async (data: Customer, recordId?: string, expectedSha?: string) => {
    setIsMutating(true);
    const client = getClient();

    try {
      if (recordId) {
        // Update
        const res = await client.updateRecord<Customer>(
          selectedCollection,
          recordId,
          data,
          expectedSha
        );
        setAlert({
          type: "success",
          title: "Customer Record Updated",
          message: `Updated "${data.name}" successfully (New SHA: ${res.sha.substring(0, 8)}...).`,
        });
      } else {
        // Create
        const newRecordId = `cust_${Date.now()}`;
        const res = await client.createRecord<Customer>(selectedCollection, data, newRecordId);
        setAlert({
          type: "success",
          title: "Customer Record Created",
          message: `Encrypted and committed "${data.name}" (SHA: ${res.sha.substring(0, 8)}...).`,
        });
      }

      await loadRecords();
    } catch (err: any) {
      handleApiError(err, recordId ? "Failed to update customer" : "Failed to create customer");
      throw err;
    } finally {
      setIsMutating(false);
    }
  };

  // Delete Customer
  const handleDeleteCustomer = async (record: CustomerRecord) => {
    if (!window.confirm(`Are you sure you want to permanently delete customer "${record.data.name}"?`)) {
      return;
    }

    setIsMutating(true);
    const client = getClient();

    try {
      await client.deleteRecord(selectedCollection, record.recordId, record.sha);
      setAlert({
        type: "success",
        title: "Customer Deleted",
        message: `Record ${record.recordId} was removed and committed to storage.`,
      });
      await loadRecords();
    } catch (err: any) {
      handleApiError(err, "Failed to delete customer");
    } finally {
      setIsMutating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased selection:bg-sky-500/30 selection:text-sky-200">
      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-slate-900/50 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-500 p-0.5 shadow-lg shadow-sky-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center text-sky-400">
                <Database className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-semibold text-slate-100 text-sm sm:text-base">Database Demo App</h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700/60">
                  External Client SDK
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Encrypted Multi-Project Database Integration Demo
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              id="open-settings-navbar-button"
              onClick={() => setIsConfigOpen(true)}
              className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-slate-100 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Shield className="w-3.5 h-3.5 text-sky-400" />
              <span>Connection Config</span>
            </button>
            <a
              href="https://github-encrypted-vault.vercel.app"
              target="_blank"
              rel="noreferrer"
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors hidden sm:flex"
              title="Open Production Database Service"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Active Alert */}
        <AlertBanner alert={alert} onDismiss={() => setAlert(null)} />

        {/* Dashboard Stats */}
        <DashboardStats
          isConnected={isConnected}
          isChecking={isCheckingConnection}
          projectId={projectId}
          collectionName={selectedCollection}
          collectionCount={collections.length}
          recordCount={records.length}
          onOpenConfig={() => setIsConfigOpen(true)}
        />

        {/* Collections & Actions Bar */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 sm:p-5 backdrop-blur-sm shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* Collection Selector & Title */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 shrink-0">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                  Customer Records
                  <span className="text-xs font-normal text-slate-400">({records.length} total)</span>
                </h2>
                <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                  <Layers className="w-3 h-3 text-slate-500" />
                  <span>Collection:</span>
                  <select
                    id="collection-select"
                    value={selectedCollection}
                    onChange={(e) => setSelectedCollection(e.target.value)}
                    className="bg-transparent border-b border-slate-700 text-sky-400 font-medium text-xs focus:outline-none focus:border-sky-400 cursor-pointer"
                  >
                    {collections.map((c) => (
                      <option key={c} value={c} className="bg-slate-900 text-slate-200">
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2.5 self-end sm:self-auto">
              <button
                id="refresh-records-button"
                onClick={() => loadRecords(searchTerm ? searchField : undefined, searchTerm || undefined)}
                disabled={isLoadingRecords || isMutating || !projectId}
                className="p-2.5 text-slate-300 hover:text-slate-100 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 rounded-xl transition-colors disabled:opacity-50"
                title="Refresh Records from Production"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingRecords ? "animate-spin text-sky-400" : ""}`} />
              </button>

              <button
                id="add-customer-button"
                onClick={() => {
                  setEditingRecord(null);
                  setIsCustomerModalOpen(true);
                }}
                disabled={!projectId || !projectToken}
                className="px-4 py-2 text-xs sm:text-sm font-medium text-slate-950 bg-sky-400 hover:bg-sky-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors flex items-center gap-2 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Add Customer</span>
              </button>
            </div>
          </div>

          {/* Search and Server-Side Filter Bar */}
          <form onSubmit={handleSearch} className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="search-filter-input"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={`Search and filter customers by ${searchField}...`}
                className="w-full pl-10 pr-4 py-2 bg-slate-950/70 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 font-mono"
              />
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-950/70 border border-slate-800 rounded-xl text-xs text-slate-400">
                <Filter className="w-3.5 h-3.5 text-slate-500" />
                <span>Field:</span>
                <select
                  id="search-field-select"
                  value={searchField}
                  onChange={(e) => setSearchField(e.target.value as any)}
                  className="bg-transparent text-slate-200 font-medium focus:outline-none cursor-pointer"
                >
                  <option value="name" className="bg-slate-900 text-slate-200">
                    Name
                  </option>
                  <option value="email" className="bg-slate-900 text-slate-200">
                    Email
                  </option>
                  <option value="phone" className="bg-slate-900 text-slate-200">
                    Phone
                  </option>
                </select>
              </div>

              <button
                id="apply-filter-button"
                type="submit"
                disabled={isLoadingRecords || !projectId}
                className="px-4 py-2 text-xs font-medium text-sky-400 hover:text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 rounded-xl transition-colors"
              >
                Filter
              </button>

              {searchTerm && (
                <button
                  id="clear-filter-button"
                  type="button"
                  onClick={handleClearSearch}
                  className="px-3 py-2 text-xs text-slate-400 hover:text-slate-200 bg-slate-800/60 rounded-xl transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Customer Records Table */}
        <CustomerTable
          records={records}
          isLoading={isLoadingRecords}
          onEdit={(record) => {
            setEditingRecord(record);
            setIsCustomerModalOpen(true);
          }}
          onDelete={handleDeleteCustomer}
          onAddNew={() => {
            setEditingRecord(null);
            setIsCustomerModalOpen(true);
          }}
          filterValue={searchTerm}
        />
      </main>

      {/* Modals */}
      <CustomerModal
        isOpen={isCustomerModalOpen}
        onClose={() => {
          setIsCustomerModalOpen(false);
          setEditingRecord(null);
        }}
        onSave={handleSaveCustomer}
        editingRecord={editingRecord}
        isLoading={isMutating}
      />

      <ConfigModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        baseUrl={baseUrl}
        projectId={projectId}
        projectToken={projectToken}
        userSessionToken={userSessionToken}
        onSaveConfig={handleSaveConfig}
      />

      {/* Footer */}
      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-500">
        <p>Database Demo App &bull; Zero Plaintext Storage &bull; AES-GCM-256 Cloud Database SDK</p>
      </footer>
    </div>
  );
};
