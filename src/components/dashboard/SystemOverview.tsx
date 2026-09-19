/**
 * SystemOverview - Live Architecture Dashboard & Simulation Controls
 */

import React, { useState, useEffect } from "react";
import { CentralDataClient } from "../../sdk/CentralDataClient";
import { ShieldCheck, Key, Database, GitBranch, RefreshCw, Smartphone, Download, Upload, CheckCircle2, AlertTriangle, Layers, Server, Lock } from "lucide-react";

export const SystemOverview: React.FC<{
  sdk: CentralDataClient;
  onNavigateToApp: (appId: string) => void;
}> = ({ sdk, onNavigateToApp }) => {
  const [localRecordCount, setLocalRecordCount] = useState<number>(0);
  const [syncStatusMsg, setSyncStatusMsg] = useState("");
  const [isSimulating, setIsSimulating] = useState(false);

  const isLoggedIn = sdk.authManager.isLoggedIn();
  const profile = sdk.authManager.getCurrentProfile();
  const ghConfig = sdk.githubClient.getConfig();

  useEffect(() => {
    fetchStats();
  }, [isLoggedIn]);

  const fetchStats = async () => {
    if (!isLoggedIn || !profile) {
      setLocalRecordCount(0);
      return;
    }
    const shRecords = await sdk.localDb.getAllRecordsForApp("shramik_hisab", profile.userId);
    const rcRecords = await sdk.localDb.getAllRecordsForApp("resume_craft", profile.userId);
    setLocalRecordCount(shRecords.length + rcRecords.length);
  };

  // Uninstall / Reinstall Simulation
  const handleSimulateUninstall = async () => {
    if (!isLoggedIn || !profile) return;
    setIsSimulating(true);
    setSyncStatusMsg("Simulating App Uninstall... Wiping local IndexedDB storage!");

    try {
      // 1. First sync to remote GitHub
      await sdk.syncApp("shramik_hisab");
      await sdk.syncApp("resume_craft");

      // 2. Clear local storage
      await sdk.localDb.clearAllLocalData();
      await fetchStats();

      setSyncStatusMsg("App Uninstalled! Local database is now EMPTY (0 records). Simulating Reinstall & Login...");

      await new Promise((r) => setTimeout(r, 1200));

      // 3. Reinstall / Restore from GitHub
      const count1 = await sdk.restoreFromCloud("shramik_hisab");
      const count2 = await sdk.restoreFromCloud("resume_craft");

      await fetchStats();
      setSyncStatusMsg(`Reinstall Complete! Restored ${count1 + count2} records cleanly from remote GitHub encrypted backup.`);
    } catch (err: any) {
      setSyncStatusMsg(`Simulation Error: ${err.message}`);
    } finally {
      setIsSimulating(false);
    }
  };

  // Export Encrypted Backup
  const handleExportBackup = async () => {
    try {
      const backupJson = await sdk.exportEncryptedBackup();
      const blob = new Blob([backupJson], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vault_backup_${Date.now()}.json.enc`;
      a.click();
      setSyncStatusMsg("Encrypted backup file generated & downloaded!");
    } catch (err: any) {
      setSyncStatusMsg(`Export Error: ${err.message}`);
    }
  };

  return (
    <div className="space-y-8">
      {/* Hero Banner */}
      <div className="p-8 bg-stone-900 border border-stone-800 rounded-2xl relative overflow-hidden">
        <div className="absolute -right-12 -bottom-12 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-xs font-mono text-amber-400">
            <ShieldCheck className="w-3.5 h-3.5" /> Reusable E2E Encrypted SDK Architecture
          </div>
          <h2 className="text-3xl font-extrabold text-stone-100 tracking-tight">
            Production GitHub Encrypted Storage System
          </h2>
          <p className="text-stone-400 text-sm leading-relaxed">
            Zero-cost, multi-application remote storage framework backed by GitHub REST API. Private user data is encrypted client-side with <span className="text-stone-200 font-semibold">AES-256-GCM</span> and derived <span className="text-stone-200 font-semibold">PBKDF2</span> keys before leaving the browser. No paid backends, Supabase, or AWS required.
          </p>
        </div>
      </div>

      {syncStatusMsg && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs font-mono flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-amber-400 flex-shrink-0" />
          {syncStatusMsg}
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-5 bg-stone-900 border border-stone-800 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-stone-400 text-xs">
            <span>Encryption Standard</span>
            <Lock className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-lg font-bold font-mono text-stone-100">AES-256-GCM</div>
          <p className="text-[10px] text-stone-500">AEAD Authenticated Tag Verification</p>
        </div>

        <div className="p-5 bg-stone-900 border border-stone-800 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-stone-400 text-xs">
            <span>Key Derivation (KDF)</span>
            <Key className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-lg font-bold font-mono text-stone-100">PBKDF2-SHA256</div>
          <p className="text-[10px] text-stone-500">600,000 Iterations • 32-Byte Salt</p>
        </div>

        <div className="p-5 bg-stone-900 border border-stone-800 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-stone-400 text-xs">
            <span>Local Database</span>
            <Database className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-lg font-bold font-mono text-stone-100">{localRecordCount} Records</div>
          <p className="text-[10px] text-stone-500">IndexedDB Offline-First Cache</p>
        </div>

        <div className="p-5 bg-stone-900 border border-stone-800 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-stone-400 text-xs">
            <span>Remote Storage</span>
            <GitBranch className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-lg font-bold font-mono text-stone-100">{ghConfig.mode} GitHub</div>
          <p className="text-[10px] text-stone-500">
            {ghConfig.owner}/{ghConfig.repo}
          </p>
        </div>
      </div>

      {/* Multi-Application Registration Showcase */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-stone-100 flex items-center gap-2">
          <Layers className="w-5 h-5 text-amber-400" /> Registered Applications (`app_id` Data Isolation)
        </h3>
        <p className="text-xs text-stone-400">
          The same SDK storage system supports multiple independent applications. Data belonging to one app is cryptographically bound and isolated from other apps.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-6 bg-stone-900 border border-stone-800 rounded-xl flex flex-col justify-between space-y-4">
            <div>
              <div className="flex justify-between items-start">
                <span className="px-2.5 py-0.5 text-xs font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full">
                  app_id: shramik_hisab
                </span>
                <span className="text-[10px] font-mono text-stone-500">v1.0.0</span>
              </div>
              <h4 className="text-base font-bold text-stone-100 mt-3">Shramik Hisab Pro</h4>
              <p className="text-xs text-stone-400 mt-1">
                Laborer attendance tracking, wage payments, advances, site material expenses, and worker photo records.
              </p>
            </div>
            <button
              onClick={() => onNavigateToApp("shramik")}
              className="w-full py-2 bg-stone-800 hover:bg-stone-700 text-amber-300 font-medium text-xs rounded-lg transition"
            >
              Open Shramik Hisab App →
            </button>
          </div>

          <div className="p-6 bg-stone-900 border border-stone-800 rounded-xl flex flex-col justify-between space-y-4">
            <div>
              <div className="flex justify-between items-start">
                <span className="px-2.5 py-0.5 text-xs font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full">
                  app_id: resume_craft
                </span>
                <span className="text-[10px] font-mono text-stone-500">v1.0.0</span>
              </div>
              <h4 className="text-base font-bold text-stone-100 mt-3">ResumeCraft Pro</h4>
              <p className="text-xs text-stone-400 mt-1">
                Professional CV builder with experience history, education records, and custom visual resume templates.
              </p>
            </div>
            <button
              onClick={() => onNavigateToApp("resume")}
              className="w-full py-2 bg-stone-800 hover:bg-stone-700 text-indigo-300 font-medium text-xs rounded-lg transition"
            >
              Open ResumeCraft App →
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Simulation Controls */}
      <div className="p-6 bg-stone-900 border border-stone-800 rounded-2xl space-y-4">
        <h3 className="text-base font-bold text-stone-100 flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-amber-400" /> Lifecycle & Disaster Recovery Simulators
        </h3>
        <p className="text-xs text-stone-400">
          Test real-world scenarios: app uninstall/reinstall, device replacement, and offline backup exports.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <button
            onClick={handleSimulateUninstall}
            disabled={!isLoggedIn || isSimulating}
            className="p-4 bg-stone-950 hover:bg-stone-800/80 border border-stone-800 rounded-xl text-left space-y-2 transition disabled:opacity-50"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
              <RefreshCw className={`w-4 h-4 ${isSimulating ? "animate-spin" : ""}`} />
              Simulate Uninstall & Reinstall
            </div>
            <p className="text-[11px] text-stone-400 leading-normal">
              Wipes local IndexedDB cache completely, re-authenticates with PBKDF2 key unwrapping, downloads remote encrypted payload from GitHub, and restores local database.
            </p>
          </button>

          <button
            onClick={handleExportBackup}
            disabled={!isLoggedIn}
            className="p-4 bg-stone-950 hover:bg-stone-800/80 border border-stone-800 rounded-xl text-left space-y-2 transition disabled:opacity-50"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
              <Download className="w-4 h-4" />
              Export Encrypted Backup File
            </div>
            <p className="text-[11px] text-stone-400 leading-normal">
              Generates an offline encrypted `.enc` file containing all application records protected with AES-256-GCM for offline air-gapped backups.
            </p>
          </button>
        </div>
      </div>
    </div>
  );
};
