import React, { useState } from "react";
import { ProjectItem } from "../../sdk/database/EncryptedDatabaseClient";
import { 
  Key, 
  ShieldCheck, 
  RefreshCw, 
  Eye, 
  EyeOff, 
  Copy, 
  Check, 
  AlertTriangle, 
  Lock, 
  CheckCircle2, 
  XOctagon,
  FileCode,
  ShieldAlert,
  Clock,
  Zap,
  Activity
} from "lucide-react";

interface CredentialsManagerViewProps {
  activeProject: ProjectItem | null;
  onRotateToken: (projectId: string) => Promise<void>;
  onRevokeToken: (projectId: string) => Promise<void>;
  isLoading: boolean;
}

export function CredentialsManagerView({
  activeProject,
  onRotateToken,
  onRevokeToken,
  isLoading,
}: CredentialsManagerViewProps) {
  const [showToken, setShowToken] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [showRotateConfirm, setShowRotateConfirm] = useState(false);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const handleRotate = async () => {
    if (!activeProject) return;
    setIsRotating(true);
    try {
      await onRotateToken(activeProject.projectId);
      setShowRotateConfirm(false);
    } finally {
      setIsRotating(false);
    }
  };

  const handleRevoke = async () => {
    if (!activeProject) return;
    setIsRevoking(true);
    try {
      await onRevokeToken(activeProject.projectId);
      setShowRevokeConfirm(false);
    } finally {
      setIsRevoking(false);
    }
  };

  if (!activeProject) {
    return (
      <div className="bg-stone-900/40 border border-stone-800 rounded-2xl p-12 text-center space-y-3">
        <Key className="w-8 h-8 text-stone-600 mx-auto" />
        <h3 className="text-sm font-medium text-stone-300">No Project Selected</h3>
        <p className="text-xs text-stone-500 max-w-sm mx-auto">
          Please select or create a project first from the Projects tab to inspect and manage its API credentials.
        </p>
      </div>
    );
  }

  const token = activeProject.projectToken || "";
  const isRevoked = !token || (activeProject.status || "active") === "disabled";
  const anyProj = activeProject as any;
  const createdAtFormatted = activeProject.createdAt ? new Date(activeProject.createdAt).toLocaleString() : "Initial generation";
  const updatedAtFormatted = activeProject.updatedAt ? new Date(activeProject.updatedAt).toLocaleString() : null;
  const lastUsedFormatted = anyProj.lastUsedAt ? new Date(anyProj.lastUsedAt).toLocaleString() : "Never recorded or pending activity";

  return (
    <div className="space-y-6">
      {/* Active Project API Token Card */}
      <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-5 sm:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Key className="w-5 h-5 text-amber-400" />
              <h3 className="text-base font-semibold text-stone-100">Project API Authentication Token</h3>
            </div>
            <p className="text-xs text-stone-400">
              Cryptographically scoped credentials for project namespace:{" "}
              <span className="font-mono text-amber-300 font-semibold">{activeProject.projectId}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            {!isRevoked ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Token Active</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <XOctagon className="w-3.5 h-3.5" />
                <span>Token Revoked</span>
              </span>
            )}
          </div>
        </div>

        {/* Token Metadata Timestamps Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-stone-950/70 border border-stone-800/80 rounded-xl p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-stone-500 uppercase">
              <Clock className="w-3 h-3 text-stone-400" />
              <span>Created Timestamp</span>
            </div>
            <div className="font-mono text-xs text-stone-300 truncate">{createdAtFormatted}</div>
          </div>

          <div className="bg-stone-950/70 border border-stone-800/80 rounded-xl p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-stone-500 uppercase">
              <RefreshCw className="w-3 h-3 text-stone-400" />
              <span>Last Rotated</span>
            </div>
            <div className="font-mono text-xs text-stone-300 truncate">{updatedAtFormatted || createdAtFormatted}</div>
          </div>

          <div className="bg-stone-950/70 border border-stone-800/80 rounded-xl p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-stone-500 uppercase">
              <Activity className="w-3 h-3 text-amber-400" />
              <span>Last Used</span>
            </div>
            <div className="font-mono text-xs text-amber-300/90 truncate">{lastUsedFormatted}</div>
          </div>
        </div>

        {/* Token Display Box */}
        <div className="space-y-2">
          <label className="text-xs font-mono text-stone-400 flex items-center justify-between">
            <span>BEARER AUTHORIZATION TOKEN</span>
            <span className="text-[11px] text-stone-500 font-normal">HMAC-SHA256 Cryptographically Signed</span>
          </label>

          <div className="bg-stone-950 border border-stone-800 rounded-xl p-3.5 flex items-center gap-3">
            <div className="flex-1 font-mono text-xs text-amber-300/90 break-all select-all">
              {isRevoked ? (
                <span className="text-stone-500 italic">No active token. Rotate credentials to generate a new API token.</span>
              ) : showToken ? (
                token
              ) : (
                "••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••"
              )}
            </div>

            {!isRevoked && (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  title={showToken ? "Hide Token" : "Show Token"}
                  className="p-2 hover:bg-stone-800 rounded-lg text-stone-400 hover:text-stone-200 transition"
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => handleCopy(token)}
                  title="Copy Token to Clipboard"
                  className="p-2 bg-stone-800 hover:bg-stone-700 rounded-lg text-stone-200 transition flex items-center gap-1.5 text-xs"
                >
                  {copiedToken ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span className="text-[11px] text-emerald-400 font-mono">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span className="text-[11px] font-mono">Copy</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Actions Bar */}
        <div className="pt-4 border-t border-stone-800/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-stone-400">
            <Lock className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>Passed via <code className="font-mono text-stone-200 bg-stone-800 px-1.5 py-0.5 rounded">Authorization: Bearer &lt;TOKEN&gt;</code></span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowRotateConfirm(true)}
              disabled={isLoading || isRotating}
              className="px-3.5 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium rounded-xl flex items-center gap-2 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRotating ? "animate-spin" : ""}`} />
              <span>Rotate Token</span>
            </button>

            {!isRevoked && (
              <button
                type="button"
                onClick={() => setShowRevokeConfirm(true)}
                disabled={isLoading || isRevoking}
                className="px-3.5 py-2 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 text-rose-300 text-xs font-medium rounded-xl flex items-center gap-2 transition"
              >
                <XOctagon className="w-3.5 h-3.5" />
                <span>Revoke Token</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Security Principles Notice */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-stone-900/60 border border-stone-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2.5 text-emerald-400">
            <ShieldCheck className="w-4 h-4" />
            <h4 className="text-xs font-semibold uppercase tracking-wider font-mono">Zero PAT Leakage Architecture</h4>
          </div>
          <p className="text-xs text-stone-400 leading-relaxed">
            Your GitHub Personal Access Token (<code className="font-mono text-stone-300">GITHUB_STORAGE_PAT</code>) is strictly held server-side in Cloud / Vercel runtime memory. Clients only communicate via HMAC-signed Project Tokens and never touch GitHub directly.
          </p>
        </div>

        <div className="bg-stone-900/60 border border-stone-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2.5 text-amber-400">
            <Lock className="w-4 h-4" />
            <h4 className="text-xs font-semibold uppercase tracking-wider font-mono">Strict Namespace Isolation</h4>
          </div>
          <p className="text-xs text-stone-400 leading-relaxed">
            Tokens generated for Project A are mathematically rejected when querying collections in Project B. Each record is encrypted with a distinct per-project AES-256-GCM key derived from the master secret.
          </p>
        </div>
      </div>

      {/* Rotate Confirmation Modal */}
      {showRotateConfirm && (
        <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-400">
              <RefreshCw className="w-6 h-6" />
              <h3 className="text-base font-semibold text-stone-100">Rotate Project Token?</h3>
            </div>
            <p className="text-xs text-stone-300 leading-relaxed">
              Rotating this token will invalidate the previous API token for <span className="font-mono text-amber-300">{activeProject.projectId}</span>. Any external microservices or scripts currently using the old token will need to be updated.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowRotateConfirm(false)}
                className="px-4 py-2 text-xs text-stone-400 hover:text-stone-200 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRotate}
                disabled={isRotating}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-medium text-xs rounded-xl transition flex items-center gap-1.5"
              >
                {isRotating && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm Rotate</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke Confirmation Modal */}
      {showRevokeConfirm && (
        <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <ShieldAlert className="w-6 h-6" />
              <h3 className="text-base font-semibold text-stone-100">Revoke Project Token?</h3>
            </div>
            <p className="text-xs text-stone-300 leading-relaxed">
              Revoking this token will immediately disable external REST API access to project <span className="font-mono text-rose-300">{activeProject.projectId}</span> until a new token is generated.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowRevokeConfirm(false)}
                className="px-4 py-2 text-xs text-stone-400 hover:text-stone-200 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRevoke}
                disabled={isRevoking}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-stone-100 font-medium text-xs rounded-xl transition flex items-center gap-1.5"
              >
                {isRevoking && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Revoke Now</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
