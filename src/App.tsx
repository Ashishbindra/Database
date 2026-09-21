/**
 * Main Application Shell & Integration Layer
 */

import React, { useState, useEffect } from "react";
import { CentralDataClient } from "./sdk/CentralDataClient";
import { Header } from "./components/layout/Header";
import { SystemOverview } from "./components/dashboard/SystemOverview";
import { ShramikHisabApp } from "./components/apps/shramik-hisab/ShramikHisabApp";
import { ResumeCraftApp } from "./components/apps/resume-craft/ResumeCraftApp";
import { RemoteStorageInspector } from "./components/dashboard/RemoteStorageInspector";
import { SecurityTestsView } from "./components/dashboard/SecurityTestsView";
import { ThreatModelView } from "./components/dashboard/ThreatModelView";
import { DeveloperDatabaseDashboard } from "./components/database-dashboard/DeveloperDatabaseDashboard";
import { GithubConfigModal } from "./components/dashboard/GithubConfigModal";
import { ShieldCheck, GitBranch, Lock, Cpu } from "lucide-react";

// Instantiate SDK instance
const sdk = new CentralDataClient();

export default function App() {
  const [activeView, setActiveView] = useState<string>("overview");
  const [isGithubModalOpen, setIsGithubModalOpen] = useState<boolean>(false);
  const [isReady, setIsReady] = useState<boolean>(false);
  const [, setRefreshKey] = useState<number>(0);

  useEffect(() => {
    sdk.init().then(() => {
      setIsReady(true);
    });
  }, []);

  const triggerRefresh = () => setRefreshKey((prev) => prev + 1);

  if (!isReady) {
    return (
      <div className="min-h-screen bg-stone-950 text-stone-100 flex items-center justify-center p-4">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-mono text-stone-400">Initializing Encrypted SDK & Local IndexedDB...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col font-sans antialiased selection:bg-amber-500 selection:text-stone-950">
      {/* Top Header */}
      <Header
        sdk={sdk}
        activeView={activeView}
        setActiveView={setActiveView}
        onOpenGithubConfig={() => setIsGithubModalOpen(true)}
        onAuthStateChanged={triggerRefresh}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {activeView === "overview" && (
          <SystemOverview
            sdk={sdk}
            onNavigateToApp={(appId) => setActiveView(appId)}
          />
        )}

        {activeView === "database" && <DeveloperDatabaseDashboard sdk={sdk} />}

        {activeView === "shramik" && <ShramikHisabApp sdk={sdk} onAuthStateChanged={triggerRefresh} />}

        {activeView === "resume" && <ResumeCraftApp sdk={sdk} />}

        {activeView === "inspector" && <RemoteStorageInspector sdk={sdk} />}

        {activeView === "security" && <SecurityTestsView />}

        {activeView === "threat" && <ThreatModelView />}
      </main>

      {/* GitHub Config Modal */}
      <GithubConfigModal
        sdk={sdk}
        isOpen={isGithubModalOpen}
        onClose={() => setIsGithubModalOpen(false)}
        onConfigUpdated={triggerRefresh}
      />

      {/* Footer */}
      <footer className="bg-stone-900/60 border-t border-stone-800/80 py-6 mt-12 text-center text-xs text-stone-500 font-mono">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-500" />
            <span>Zero-Cost GitHub Encrypted Storage System</span>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-stone-400">
            <span>AES-256-GCM AEAD</span>
            <span>•</span>
            <span>PBKDF2 (600k Iterations)</span>
            <span>•</span>
            <span>IndexedDB Offline Cache</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
