import React, { useState, useEffect, useCallback } from "react";
import { 
  EncryptedDatabaseClient, 
  ProjectItem, 
  RecordEnvelope, 
  RawRecordEnvelope,
  DatabaseUsageTelemetry,
  ProjectStatsResult
} from "../../sdk/database/EncryptedDatabaseClient";
import { CentralDataClient } from "../../sdk/CentralDataClient";
import { ProjectsManagerView } from "./ProjectsManagerView";
import { CredentialsManagerView } from "./CredentialsManagerView";
import { CollectionsManagerView } from "./CollectionsManagerView";
import { DatabaseExplorerView } from "./DatabaseExplorerView";
import { PublicApiDocsView } from "./PublicApiDocsView";
import { PublicDatabaseLanding } from "./PublicDatabaseLanding";
import { ApiPlaygroundView } from "./ApiPlaygroundView";
import { UsageStatsView } from "./UsageStatsView";
import { 
  Database, 
  Layers, 
  Key, 
  Search, 
  BookOpen, 
  ShieldCheck, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  ExternalLink,
  Lock,
  Plus,
  ArrowUpRight,
  Sparkles,
  LayoutGrid,
  Terminal,
  Activity,
  BarChart3
} from "lucide-react";

interface DeveloperDatabaseDashboardProps {
  sdk: CentralDataClient;
}

type DashboardTab = 
  | "overview" 
  | "projects" 
  | "credentials" 
  | "collections" 
  | "explorer" 
  | "usage" 
  | "playground" 
  | "docs";

export function DeveloperDatabaseDashboard({ sdk }: DeveloperDatabaseDashboardProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>("projects");
  const [dbClient, setDbClient] = useState<EncryptedDatabaseClient | null>(null);
  
  // Projects State
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [activeProject, setActiveProject] = useState<ProjectItem | null>(null);
  const [collections, setCollections] = useState<string[]>([]);
  const [activeCollection, setActiveCollection] = useState<string>("");
  const [collectionCounts, setCollectionCounts] = useState<Record<string, number>>({});

  // Loading and Notification States
  const [isLoading, setIsLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [globalSuccess, setGlobalSuccess] = useState<string | null>(null);

  // Initialize DB Client with User Session or default Base URL
  useEffect(() => {
    const sessionToken = sdk.authManager.getSessionToken();
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const client = new EncryptedDatabaseClient({
      baseUrl: origin,
      userSessionToken: sessionToken || "demo-session-token",
    });
    setDbClient(client);
  }, [sdk]);

  // Load Projects on mount
  const refreshProjects = useCallback(async () => {
    if (!dbClient) return;
    setIsLoading(true);
    setGlobalError(null);
    try {
      const projs = await dbClient.listProjects();
      setProjects(projs);
      if (projs.length > 0 && !activeProject) {
        // Select first active project
        const firstActive = projs.find(p => p.status !== "disabled") || projs[0];
        handleSelectProject(firstActive);
      }
    } catch (err: any) {
      console.warn("Could not list projects automatically:", err.message);
    } finally {
      setIsLoading(false);
    }
  }, [dbClient, activeProject]);

  useEffect(() => {
    if (dbClient) {
      refreshProjects();
    }
  }, [dbClient]);

  // Select project & load its collections
  const handleSelectProject = async (project: ProjectItem) => {
    setActiveProject(project);
    if (!dbClient) return;

    dbClient.setProject(project.projectId, project.projectToken);
    
    try {
      const cols = await dbClient.listCollections();
      setCollections(cols);
      if (cols.length > 0) {
        setActiveCollection(cols[0]);
      } else {
        setActiveCollection("");
      }

      // Count records for each collection in background
      const counts: Record<string, number> = {};
      for (const c of cols) {
        try {
          const recs = await dbClient.listRecords(c);
          counts[c] = recs.length;
        } catch {
          counts[c] = 0;
        }
      }
      setCollectionCounts(counts);
    } catch (err: any) {
      console.warn("Could not list collections for project:", err.message);
      setCollections([]);
      setActiveCollection("");
    }
  };

  // Create Project
  const handleCreateProject = async (projectId: string) => {
    if (!dbClient) return;
    setIsLoading(true);
    setGlobalError(null);
    try {
      const created = await dbClient.createProject(projectId);
      setGlobalSuccess(`Project '${projectId}' created successfully.`);
      const updatedList = await dbClient.listProjects();
      setProjects(updatedList);
      const found = updatedList.find(p => p.projectId === created.projectId) || {
        projectId: created.projectId,
        projectToken: created.projectToken,
        status: "active",
      };
      await handleSelectProject(found);
      setTimeout(() => setGlobalSuccess(null), 3000);
    } catch (err: any) {
      setGlobalError(err.message || "Failed to create project.");
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle Project Status
  const handleToggleProjectStatus = async (projectId: string, currentStatus: "active" | "disabled") => {
    if (!dbClient) return;
    setIsLoading(true);
    const newStatus = currentStatus === "active" ? "disabled" : "active";
    try {
      await dbClient.updateProjectStatus(projectId, newStatus);
      setGlobalSuccess(`Project '${projectId}' marked as ${newStatus}.`);
      const updatedList = await dbClient.listProjects();
      setProjects(updatedList);
      if (activeProject?.projectId === projectId) {
        setActiveProject({ ...activeProject, status: newStatus });
      }
      setTimeout(() => setGlobalSuccess(null), 3000);
    } catch (err: any) {
      setGlobalError(err.message || "Failed to update project status.");
    } finally {
      setIsLoading(false);
    }
  };

  // Rotate Project Token
  const handleRotateToken = async (projectId: string): Promise<void> => {
    if (!dbClient) throw new Error("Database client not ready");
    setIsLoading(true);
    try {
      const rotated = await dbClient.rotateProjectToken(projectId);
      setGlobalSuccess(`New API Token generated for '${projectId}'.`);
      const updatedList = await dbClient.listProjects();
      setProjects(updatedList);
      if (activeProject?.projectId === projectId) {
        const updatedProj = { ...activeProject, projectToken: rotated.projectToken };
        setActiveProject(updatedProj);
        dbClient.setProject(projectId, rotated.projectToken);
      }
      setTimeout(() => setGlobalSuccess(null), 3000);
    } catch (err: any) {
      setGlobalError(err.message || "Failed to rotate token.");
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Revoke Project Token
  const handleRevokeToken = async (projectId: string) => {
    if (!dbClient) return;
    setIsLoading(true);
    try {
      await dbClient.updateProjectStatus(projectId, "disabled");
      setGlobalSuccess(`Project token revoked for '${projectId}'. Status is now disabled.`);
      const updatedList = await dbClient.listProjects();
      setProjects(updatedList);
      if (activeProject?.projectId === projectId) {
        setActiveProject({ ...activeProject, status: "disabled" });
      }
      setTimeout(() => setGlobalSuccess(null), 3000);
    } catch (err: any) {
      setGlobalError(err.message || "Failed to revoke token.");
    } finally {
      setIsLoading(false);
    }
  };

  // Delete Project
  const handleDeleteProject = async (projectId: string) => {
    if (!dbClient) return;
    setIsLoading(true);
    try {
      await dbClient.deleteProject(projectId);
      setGlobalSuccess(`Project '${projectId}' deleted.`);
      const updatedList = await dbClient.listProjects();
      setProjects(updatedList);
      if (activeProject?.projectId === projectId) {
        const nextActive = updatedList[0] || null;
        if (nextActive) {
          await handleSelectProject(nextActive);
        } else {
          setActiveProject(null);
          setCollections([]);
          setActiveCollection("");
        }
      }
      setTimeout(() => setGlobalSuccess(null), 3000);
    } catch (err: any) {
      setGlobalError(err.message || "Failed to delete project.");
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Create Collection
  const handleCreateCollection = async (collection: string) => {
    if (!dbClient || !activeProject) return;
    setIsLoading(true);
    try {
      await dbClient.createCollection(collection);
      setGlobalSuccess(`Collection '${collection}' created.`);
      const cols = await dbClient.listCollections();
      setCollections(cols);
      setActiveCollection(collection);
      setTimeout(() => setGlobalSuccess(null), 3000);
    } catch (err: any) {
      setGlobalError(err.message || "Failed to create collection.");
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Delete Collection
  const handleDeleteCollection = async (collection: string) => {
    if (!dbClient || !activeProject) return;
    setIsLoading(true);
    try {
      await dbClient.deleteCollection(collection);
      setGlobalSuccess(`Collection '${collection}' deleted.`);
      const cols = await dbClient.listCollections();
      setCollections(cols);
      if (activeCollection === collection) {
        setActiveCollection(cols[0] || "");
      }
      setTimeout(() => setGlobalSuccess(null), 3000);
    } catch (err: any) {
      setGlobalError(err.message || "Failed to delete collection.");
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Records Operations
  const handleListRecords = async (col: string, filterField?: string, filterValue?: string) => {
    if (!dbClient || !activeProject) return [];
    return dbClient.listRecords(col, { filterField, filterValue });
  };

  const handleCreateRecord = async (col: string, data: any, recordId?: string) => {
    if (!dbClient || !activeProject) throw new Error("No active project");
    return dbClient.createRecord(col, data, recordId);
  };

  const handleUpdateRecord = async (col: string, recordId: string, data: any, expectedSha?: string) => {
    if (!dbClient || !activeProject) throw new Error("No active project");
    return dbClient.updateRecord(col, recordId, data, expectedSha);
  };

  const handleDeleteRecord = async (col: string, recordId: string, expectedSha?: string) => {
    if (!dbClient || !activeProject) throw new Error("No active project");
    return dbClient.deleteRecord(col, recordId, expectedSha);
  };

  const handleGetRawEnvelope = async (col: string, recordId: string) => {
    if (!dbClient || !activeProject) throw new Error("No active project");
    return dbClient.getRawRecordEnvelope(col, recordId);
  };

  const handleFetchUsage = async () => {
    if (!dbClient) throw new Error("Database client not ready");
    return dbClient.getUsage();
  };

  const handleFetchProjectStats = async (projectId: string) => {
    if (!dbClient) throw new Error("Database client not ready");
    return dbClient.getProjectStats(projectId);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Main Navigation Header */}
      <div className="bg-stone-900/90 border border-stone-800 rounded-3xl p-6 shadow-xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-stone-100 tracking-tight">
                  Developer Database Dashboard
                </h1>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  AES-256-GCM Engine
                </span>
              </div>
              <p className="text-xs text-stone-400">
                Encrypted multi-tenant JSON database backed directly by GitHub Git trees with zero database hosting fees.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick Link to Standalone Demo */}
            <a
              href="/examples/database-demo"
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-medium rounded-xl flex items-center gap-1.5 transition"
            >
              <span>Launch Demo App</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-amber-400" />
            </a>

            {/* Refresh Projects Button */}
            <button
              onClick={refreshProjects}
              disabled={isLoading}
              title="Refresh project list"
              className="p-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-xl transition"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-amber-400" : ""}`} />
            </button>
          </div>
        </div>

        {/* Global Notifications */}
        {globalError && (
          <div className="p-3.5 bg-rose-950/40 border border-rose-800/60 rounded-2xl text-xs text-rose-300 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>{globalError}</span>
            </div>
            <button onClick={() => setGlobalError(null)} className="text-stone-400 hover:text-stone-200 text-xs font-mono">
              Dismiss
            </button>
          </div>
        )}

        {globalSuccess && (
          <div className="p-3.5 bg-emerald-950/40 border border-emerald-800/60 rounded-2xl text-xs text-emerald-300 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>{globalSuccess}</span>
            </div>
            <button onClick={() => setGlobalSuccess(null)} className="text-stone-400 hover:text-stone-200 text-xs font-mono">
              Dismiss
            </button>
          </div>
        )}

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 border-t border-stone-800/80 pt-4 overflow-x-auto pb-1 scrollbar-thin">
          <button
            onClick={() => setActiveTab("overview")}
            className={`px-3.5 py-2 rounded-xl text-xs font-medium font-mono flex items-center gap-1.5 transition flex-shrink-0 ${
              activeTab === "overview"
                ? "bg-amber-500 text-stone-950 shadow-sm font-semibold"
                : "bg-stone-950/60 text-stone-400 hover:text-stone-200 border border-stone-800/80"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Overview</span>
          </button>

          <button
            onClick={() => setActiveTab("projects")}
            className={`px-3.5 py-2 rounded-xl text-xs font-medium font-mono flex items-center gap-1.5 transition flex-shrink-0 ${
              activeTab === "projects"
                ? "bg-amber-500 text-stone-950 shadow-sm font-semibold"
                : "bg-stone-950/60 text-stone-400 hover:text-stone-200 border border-stone-800/80"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Projects ({projects.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("credentials")}
            className={`px-3.5 py-2 rounded-xl text-xs font-medium font-mono flex items-center gap-1.5 transition flex-shrink-0 ${
              activeTab === "credentials"
                ? "bg-amber-500 text-stone-950 shadow-sm font-semibold"
                : "bg-stone-950/60 text-stone-400 hover:text-stone-200 border border-stone-800/80"
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>API Keys</span>
          </button>

          <button
            onClick={() => setActiveTab("collections")}
            className={`px-3.5 py-2 rounded-xl text-xs font-medium font-mono flex items-center gap-1.5 transition flex-shrink-0 ${
              activeTab === "collections"
                ? "bg-amber-500 text-stone-950 shadow-sm font-semibold"
                : "bg-stone-950/60 text-stone-400 hover:text-stone-200 border border-stone-800/80"
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Collections ({collections.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("explorer")}
            className={`px-3.5 py-2 rounded-xl text-xs font-medium font-mono flex items-center gap-1.5 transition flex-shrink-0 ${
              activeTab === "explorer"
                ? "bg-amber-500 text-stone-950 shadow-sm font-semibold"
                : "bg-stone-950/60 text-stone-400 hover:text-stone-200 border border-stone-800/80"
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>Explorer</span>
          </button>

          <button
            onClick={() => setActiveTab("usage")}
            className={`px-3.5 py-2 rounded-xl text-xs font-medium font-mono flex items-center gap-1.5 transition flex-shrink-0 ${
              activeTab === "usage"
                ? "bg-amber-500 text-stone-950 shadow-sm font-semibold"
                : "bg-stone-950/60 text-stone-400 hover:text-stone-200 border border-stone-800/80"
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Usage & Stats</span>
          </button>

          <button
            onClick={() => setActiveTab("playground")}
            className={`px-3.5 py-2 rounded-xl text-xs font-medium font-mono flex items-center gap-1.5 transition flex-shrink-0 ${
              activeTab === "playground"
                ? "bg-amber-500 text-stone-950 shadow-sm font-semibold"
                : "bg-stone-950/60 text-stone-400 hover:text-stone-200 border border-stone-800/80"
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>API Playground</span>
          </button>

          <button
            onClick={() => setActiveTab("docs")}
            className={`px-3.5 py-2 rounded-xl text-xs font-medium font-mono flex items-center gap-1.5 transition flex-shrink-0 ${
              activeTab === "docs"
                ? "bg-amber-500 text-stone-950 shadow-sm font-semibold"
                : "bg-stone-950/60 text-stone-400 hover:text-stone-200 border border-stone-800/80"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Documentation</span>
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="transition-opacity duration-200">
        {activeTab === "overview" && (
          <PublicDatabaseLanding
            onOpenDashboard={() => setActiveTab("projects")}
            onOpenDocs={() => setActiveTab("docs")}
            onOpenDemo={() => {
              if (typeof window !== "undefined") {
                window.open("/examples/database-demo", "_blank");
              }
            }}
          />
        )}

        {activeTab === "projects" && (
          <ProjectsManagerView
            projects={projects}
            activeProject={activeProject}
            onSelectProject={handleSelectProject}
            onCreateProject={handleCreateProject}
            onToggleStatus={handleToggleProjectStatus}
            onRotateToken={handleRotateToken}
            onDeleteProject={handleDeleteProject}
            onNavigateToExplorer={() => setActiveTab("explorer")}
            isLoading={isLoading}
          />
        )}

        {activeTab === "credentials" && (
          <CredentialsManagerView
            activeProject={activeProject}
            onRotateToken={handleRotateToken}
            onRevokeToken={handleRevokeToken}
            isLoading={isLoading}
          />
        )}

        {activeTab === "collections" && (
          <CollectionsManagerView
            activeProject={activeProject}
            collections={collections}
            collectionCounts={collectionCounts}
            onSelectCollection={(col) => setActiveCollection(col)}
            onCreateCollection={handleCreateCollection}
            onDeleteCollection={handleDeleteCollection}
            onNavigateToExplorer={() => setActiveTab("explorer")}
            isLoading={isLoading}
          />
        )}

        {activeTab === "explorer" && (
          <DatabaseExplorerView
            projects={projects}
            activeProject={activeProject}
            collections={collections}
            activeCollection={activeCollection}
            onSelectProject={handleSelectProject}
            onSelectCollection={(col) => setActiveCollection(col)}
            onListRecords={handleListRecords}
            onCreateRecord={handleCreateRecord}
            onUpdateRecord={handleUpdateRecord}
            onDeleteRecord={handleDeleteRecord}
            onGetRawEnvelope={handleGetRawEnvelope}
            isLoading={isLoading}
          />
        )}

        {activeTab === "usage" && (
          <UsageStatsView
            activeProject={activeProject}
            projects={projects}
            onFetchUsage={handleFetchUsage}
            onFetchProjectStats={handleFetchProjectStats}
          />
        )}

        {activeTab === "playground" && (
          <ApiPlaygroundView
            activeProject={activeProject}
            projects={projects}
          />
        )}

        {activeTab === "docs" && (
          <PublicApiDocsView
            activeProject={activeProject}
            onNavigateToProjects={() => setActiveTab("projects")}
            onNavigateToExplorer={() => setActiveTab("explorer")}
            onNavigateToPlayground={() => setActiveTab("playground")}
          />
        )}
      </div>
    </div>
  );
}
