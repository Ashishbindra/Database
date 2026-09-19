/**
 * GithubConfigModal - Storage Provider & Authorization Mode Inspector
 */

import React, { useState } from "react";
import { CentralDataClient } from "../../sdk/CentralDataClient";
import { GitBranch, ShieldCheck, Server } from "lucide-react";

export const GithubConfigModal: React.FC<{
  sdk: CentralDataClient;
  isOpen: boolean;
  onClose: () => void;
  onConfigUpdated: () => void;
}> = ({ sdk, isOpen, onClose, onConfigUpdated }) => {
  const currentConfig = sdk.githubClient.getConfig();

  const [mode, setMode] = useState<"SERVER" | "MOCK" | "REAL">(currentConfig.mode);
  const [owner, setOwner] = useState(currentConfig.owner);
  const [repo, setRepo] = useState(currentConfig.repo);
  const [branch, setBranch] = useState(currentConfig.branch);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    sdk.githubClient.updateConfig({
      mode,
      owner,
      repo,
      branch,
    });
    onConfigUpdated();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-stone-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-stone-900 border border-stone-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-6">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-bold text-stone-100 flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-amber-500" /> Remote Storage & Authorization Mode
          </h3>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-300">
            ✕
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-stone-300 mb-2">Storage Provider Mode</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMode("SERVER")}
                className={`p-3 rounded-xl border text-left transition ${
                  mode === "SERVER"
                    ? "bg-amber-500/10 border-amber-500 text-amber-300 font-bold"
                    : "bg-stone-950 border-stone-800 text-stone-400"
                }`}
              >
                <div className="text-xs flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-amber-500" /> Server Proxy (Zero PAT)
                </div>
                <div className="text-[10px] text-stone-500 font-normal mt-0.5">
                  Protected via /api/vault/* Express Proxy. Zero PAT on client.
                </div>
              </button>

              <button
                type="button"
                onClick={() => setMode("MOCK")}
                className={`p-3 rounded-xl border text-left transition ${
                  mode === "MOCK"
                    ? "bg-amber-500/10 border-amber-500 text-amber-300 font-bold"
                    : "bg-stone-950 border-stone-800 text-stone-400"
                }`}
              >
                <div className="text-xs">Virtual Sandbox Remote</div>
                <div className="text-[10px] text-stone-500 font-normal mt-0.5">
                  In-Memory Mock Remote (100% Offline Testing)
                </div>
              </button>
            </div>
          </div>

          <div className="p-3 bg-stone-950 border border-stone-800 rounded-xl space-y-2 text-xs">
            <div className="flex items-center gap-2 text-amber-400 font-semibold">
              <ShieldCheck className="w-4 h-4" /> Zero-Client PAT Architecture Active
            </div>
            <p className="text-stone-400 text-[11px] leading-relaxed">
              GitHub repository write PAT credentials reside strictly in server-side environment variables (<code className="text-amber-300 font-mono">process.env.GITHUB_STORAGE_PAT</code>).
              The browser client NEVER holds GitHub tokens.
            </p>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs rounded-xl transition mt-4"
          >
            Apply Settings
          </button>
        </form>
      </div>
    </div>
  );
};
