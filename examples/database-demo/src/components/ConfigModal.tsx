import React, { useState } from "react";
import { X, Key, Database, Globe, CheckCircle2, ShieldAlert, Sparkles, Loader2 } from "lucide-react";
import { EncryptedDatabaseClient } from "../client/EncryptedDatabaseClient";

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  baseUrl: string;
  projectId: string;
  projectToken: string;
  userSessionToken: string;
  onSaveConfig: (config: {
    baseUrl: string;
    projectId: string;
    projectToken: string;
    userSessionToken: string;
  }) => void;
}

export const ConfigModal: React.FC<ConfigModalProps> = ({
  isOpen,
  onClose,
  baseUrl,
  projectId,
  projectToken,
  userSessionToken,
  onSaveConfig,
}) => {
  const [formBaseUrl, setFormBaseUrl] = useState(baseUrl);
  const [formProjectId, setFormProjectId] = useState(projectId);
  const [formProjectToken, setFormProjectToken] = useState(projectToken);
  const [formSessionToken, setFormSessionToken] = useState(userSessionToken);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisionMessage, setProvisionMessage] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  if (!isOpen) return null;

  const handleQuickProvision = async () => {
    if (!formBaseUrl) {
      setErrorMsg("Base URL is required to provision a project.");
      return;
    }
    setIsProvisioning(true);
    setErrorMsg("");
    setProvisionMessage("Authenticating user session on production server...");

    try {
      const cleanUrl = formBaseUrl.replace(/\/+$/, "");
      const uniqueUser = `demo_user_${Date.now()}`;
      const opaqueUserId = `opaque_${Date.now()}`;

      // Register or authenticate via production endpoint
      const authRes = await fetch(`${cleanUrl}/api/vault/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: uniqueUser,
          opaqueUserId,
          saltHex: "00112233445566778899aabbccddeeff",
          authProofHash: "demo_auth_proof_hash_sample",
          wrappedDek: "demo_wrapped_dek_sample",
        }),
      });

      if (!authRes.ok) {
        throw new Error(`Authentication failed: HTTP ${authRes.status}`);
      }

      const authData = await authRes.json();
      const sessionToken = authData.sessionToken;
      setFormSessionToken(sessionToken);

      setProvisionMessage("Creating dedicated encrypted project namespace...");
      const client = new EncryptedDatabaseClient({
        baseUrl: cleanUrl,
        userSessionToken: sessionToken,
      });

      const newProjectId = `demo_crm_${Date.now()}`;
      const projectResult = await client.createProject(newProjectId);

      setFormProjectId(projectResult.projectId);
      setFormProjectToken(projectResult.projectToken);

      setProvisionMessage("Creating default 'customers' collection...");
      await client.createCollection("customers");

      setProvisionMessage("Project ready!");
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to auto-provision project.");
    } finally {
      setIsProvisioning(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formBaseUrl.trim()) {
      setErrorMsg("Database URL is required.");
      return;
    }
    if (!formProjectId.trim()) {
      setErrorMsg("Project ID is required.");
      return;
    }
    if (!formProjectToken.trim()) {
      setErrorMsg("Project Token is required.");
      return;
    }

    onSaveConfig({
      baseUrl: formBaseUrl.trim(),
      projectId: formProjectId.trim(),
      projectToken: formProjectToken.trim(),
      userSessionToken: formSessionToken.trim(),
    });
    onClose();
  };

  return (
    <div
      id="config-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in"
    >
      <div
        id="config-modal-container"
        className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100 text-base">Production Database Configuration</h3>
              <p className="text-xs text-slate-400">External Client Credentials & Endpoint Settings</p>
            </div>
          </div>
          <button
            id="close-config-modal-button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-5">
          {errorMsg && (
            <div className="p-3 bg-rose-950/60 border border-rose-800/60 rounded-xl text-rose-300 text-xs">
              {errorMsg}
            </div>
          )}

          {provisionMessage && !errorMsg && (
            <div className="p-3 bg-sky-950/60 border border-sky-800/60 rounded-xl text-sky-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-sky-400" />
              <span>{provisionMessage}</span>
            </div>
          )}

          {/* Quick Auto-Provisioning Helper */}
          <div className="p-4 bg-sky-950/30 border border-sky-900/40 rounded-xl flex items-center justify-between gap-4">
            <div>
              <span className="text-xs font-semibold text-sky-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Auto-Provision Demo Project
              </span>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Automatically generate a new project and retrieve its signed Project API Token from production.
              </p>
            </div>
            <button
              id="auto-provision-button"
              type="button"
              onClick={handleQuickProvision}
              disabled={isProvisioning}
              className="px-3 py-1.5 text-xs font-medium bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 border border-sky-500/30 rounded-lg transition-colors shrink-0 flex items-center gap-1.5"
            >
              {isProvisioning ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Provisioning...</span>
                </>
              ) : (
                <span>Auto-Create</span>
              )}
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-slate-400" /> Production Database URL *
            </label>
            <input
              id="config-baseurl-input"
              type="url"
              value={formBaseUrl}
              onChange={(e) => setFormBaseUrl(e.target.value)}
              placeholder="https://github-encrypted-vault.vercel.app"
              required
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 text-sm font-mono focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-slate-400" /> Project ID *
              </label>
              <input
                id="config-projectid-input"
                type="text"
                value={formProjectId}
                onChange={(e) => setFormProjectId(e.target.value)}
                placeholder="e.g. demo_crm_123"
                required
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 text-sm font-mono focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-slate-400" /> Project API Token *
              </label>
              <input
                id="config-projecttoken-input"
                type="password"
                value={formProjectToken}
                onChange={(e) => setFormProjectToken(e.target.value)}
                placeholder="Cryptographically signed project token"
                required
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 text-sm font-mono focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>

          <div className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-medium text-amber-300">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Security Guarantee</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              This demo client uses public Project API Tokens only. Zero GitHub Personal Access Tokens (PAT), Session Secrets, or server encryption master keys are ever present in the frontend.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              id="cancel-config-button"
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              id="save-config-button"
              type="submit"
              className="px-5 py-2 text-sm font-medium text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-xl transition-colors shadow-sm"
            >
              Apply Settings
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
