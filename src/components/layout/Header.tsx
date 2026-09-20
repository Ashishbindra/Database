/**
 * Header Navigation & User Key Vault Controller
 */

import React, { useState } from "react";
import { CentralDataClient } from "../../sdk/CentralDataClient";
import { Shield, Key, Lock, Unlock, LogOut, UserPlus, LogIn, Settings, LifeBuoy } from "lucide-react";

export const Header: React.FC<{
  sdk: CentralDataClient;
  activeView: string;
  setActiveView: (v: string) => void;
  onOpenGithubConfig: () => void;
  onAuthStateChanged: () => void;
}> = ({ sdk, activeView, setActiveView, onOpenGithubConfig, onAuthStateChanged }) => {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authTab, setAuthTab] = useState<"LOGIN" | "REGISTER" | "RECOVER">("LOGIN");

  // Form State
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryPhraseInput, setRecoveryPhraseInput] = useState("");
  const [generatedWords, setGeneratedWords] = useState<string[] | null>(null);

  const [authError, setAuthError] = useState("");
  const [authSuccess, setAuthSuccess] = useState("");

  const isLoggedIn = sdk.authManager.isLoggedIn();
  const profile = sdk.authManager.getCurrentProfile();
  const ghConfig = sdk.githubClient.getConfig();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthSuccess("");

    try {
      const res = await sdk.authManager.register(username, password);
      setGeneratedWords(res.recoveryWords);
      setAuthSuccess(`Account created! Save your 24-word recovery phrase.`);
      onAuthStateChanged();
    } catch (err: any) {
      setAuthError(err.message);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthSuccess("");

    try {
      await sdk.authManager.login(username, password);
      setAuthSuccess("Vault unlocked! Session active.");
      setShowAuthModal(false);
      onAuthStateChanged();
    } catch (err: any) {
      setAuthError(err.message);
    }
  };

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthSuccess("");

    const words = recoveryPhraseInput.trim().split(/\s+/);
    if (words.length !== 24) {
      setAuthError("Please enter all 24 recovery words separated by spaces.");
      return;
    }

    try {
      await sdk.authManager.recoverWithPhrase(username, words, password || undefined);
      setAuthSuccess("Key recovered & session unlocked!");
      setShowAuthModal(false);
      onAuthStateChanged();
    } catch (err: any) {
      setAuthError(err.message);
    }
  };

  const handleLogout = () => {
    sdk.authManager.logout();
    setGeneratedWords(null);
    onAuthStateChanged();
  };

  return (
    <>
      <header className="bg-stone-900 border-b border-stone-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-stone-950 shadow-lg shadow-amber-500/10">
              <Shield className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-stone-100 tracking-tight">GitHub Encrypted Vault</h1>
                <span className="px-2 py-0.5 text-[10px] font-mono bg-stone-800 text-stone-300 border border-stone-700 rounded-full">
                  v1.0 SDK
                </span>
              </div>
              <p className="text-[11px] text-stone-400">Zero-Cost E2E Encrypted Storage Layer</p>
            </div>
          </div>

          {/* Center Navigation Tabs */}
          <nav className="flex items-center gap-1 bg-stone-950 p-1 border border-stone-800 rounded-xl text-xs font-medium">
            <button
              onClick={() => setActiveView("overview")}
              className={`px-3 py-1.5 rounded-lg transition ${
                activeView === "overview" ? "bg-stone-800 text-amber-400 font-semibold" : "text-stone-400 hover:text-stone-200"
              }`}
            >
              System Overview
            </button>
            <button
              onClick={() => setActiveView("shramik")}
              className={`px-3 py-1.5 rounded-lg transition ${
                activeView === "shramik" ? "bg-amber-500/20 text-amber-300 font-semibold" : "text-stone-400 hover:text-stone-200"
              }`}
            >
              Shramik Hisab
            </button>
            <button
              onClick={() => setActiveView("resume")}
              className={`px-3 py-1.5 rounded-lg transition ${
                activeView === "resume" ? "bg-indigo-500/20 text-indigo-300 font-semibold" : "text-stone-400 hover:text-stone-200"
              }`}
            >
              ResumeCraft
            </button>
            <button
              onClick={() => setActiveView("inspector")}
              className={`px-3 py-1.5 rounded-lg transition ${
                activeView === "inspector" ? "bg-stone-800 text-stone-200 font-semibold" : "text-stone-400 hover:text-stone-200"
              }`}
            >
              GitHub File Tree
            </button>
            <button
              onClick={() => setActiveView("security")}
              className={`px-3 py-1.5 rounded-lg transition ${
                activeView === "security" ? "bg-emerald-500/20 text-emerald-300 font-semibold" : "text-stone-400 hover:text-stone-200"
              }`}
            >
              Security Tests
            </button>
            <button
              onClick={() => setActiveView("threat")}
              className={`px-3 py-1.5 rounded-lg transition ${
                activeView === "threat" ? "bg-stone-800 text-stone-200 font-semibold" : "text-stone-400 hover:text-stone-200"
              }`}
            >
              Threat Model
            </button>
            <a
              href="/examples/database-demo"
              className="px-3 py-1.5 rounded-lg transition text-sky-400 hover:text-sky-300 hover:bg-sky-500/10 font-mono text-[11px]"
            >
              Demo App ↗
            </a>
          </nav>

          {/* Right Action Controls */}
          <div className="flex items-center gap-2">
            {/* GitHub Mode Indicator */}
            <button
              onClick={onOpenGithubConfig}
              className="px-2.5 py-1.5 bg-stone-800 hover:bg-stone-700 border border-stone-700 rounded-lg text-xs text-stone-300 flex items-center gap-1.5 transition"
            >
              <Settings className="w-3.5 h-3.5 text-stone-400" />
              <span className="font-mono text-[11px] text-amber-400">{ghConfig.mode} GitHub</span>
            </button>

            {/* Auth Button */}
            {isLoggedIn ? (
              <div className="flex items-center gap-2 bg-stone-950 border border-emerald-500/30 px-3 py-1 rounded-xl">
                <Unlock className="w-4 h-4 text-emerald-400" />
                <div className="text-left">
                  <div className="text-xs font-bold text-stone-200">{profile?.username}</div>
                  <div className="text-[9px] font-mono text-emerald-400">Key Unlocked</div>
                </div>
                <button
                  onClick={handleLogout}
                  title="Lock Session / Logout"
                  className="ml-2 p-1 hover:bg-stone-800 text-stone-400 hover:text-red-400 rounded transition"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold text-xs rounded-xl flex items-center gap-1.5 transition shadow-sm"
              >
                <Lock className="w-3.5 h-3.5" /> Unlock Vault / Login
              </button>
            )}
          </div>
        </div>
      </header>

      {/* AUTH & RECOVERY MODAL */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-stone-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-stone-100 flex items-center gap-2">
                <Key className="w-5 h-5 text-amber-500" /> Key Vault Authentication
              </h3>
              <button
                onClick={() => setShowAuthModal(false)}
                className="text-stone-500 hover:text-stone-300 text-sm"
              >
                ✕
              </button>
            </div>

            {/* Auth Tab Picker */}
            <div className="flex bg-stone-950 p-1 border border-stone-800 rounded-xl mb-6 text-xs font-medium">
              <button
                onClick={() => {
                  setAuthTab("LOGIN");
                  setAuthError("");
                  setAuthSuccess("");
                }}
                className={`flex-1 py-1.5 rounded-lg ${authTab === "LOGIN" ? "bg-stone-800 text-amber-400" : "text-stone-400"}`}
              >
                Sign In
              </button>
              <button
                onClick={() => {
                  setAuthTab("REGISTER");
                  setAuthError("");
                  setAuthSuccess("");
                }}
                className={`flex-1 py-1.5 rounded-lg ${authTab === "REGISTER" ? "bg-stone-800 text-amber-400" : "text-stone-400"}`}
              >
                Register
              </button>
              <button
                onClick={() => {
                  setAuthTab("RECOVER");
                  setAuthError("");
                  setAuthSuccess("");
                }}
                className={`flex-1 py-1.5 rounded-lg ${authTab === "RECOVER" ? "bg-stone-800 text-amber-400" : "text-stone-400"}`}
              >
                24-Word Recovery
              </button>
            </div>

            {authError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg font-mono">
                {authError}
              </div>
            )}

            {authSuccess && (
              <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-lg font-mono">
                {authSuccess}
              </div>
            )}

            {/* LOGIN FORM */}
            {authTab === "LOGIN" && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs text-stone-400 mb-1">Username</label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. ashish"
                    className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-stone-400 mb-1">Vault Password</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs rounded-xl transition"
                >
                  Unlock Encryption Key & Login
                </button>
              </form>
            )}

            {/* REGISTER FORM */}
            {authTab === "REGISTER" && (
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className="block text-xs text-stone-400 mb-1">Username</label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. ashish"
                    className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-stone-400 mb-1">Master Password</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-100 focus:outline-none focus:border-amber-500"
                  />
                  <p className="text-[10px] text-stone-500 mt-1">Used to derive KEK via PBKDF2 (600,000 iterations).</p>
                </div>

                {generatedWords && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-2">
                    <span className="text-xs font-bold text-amber-400">Save Your 24-Word Emergency Recovery Phrase:</span>
                    <div className="p-2 bg-stone-950 rounded text-[10px] font-mono text-stone-300 leading-relaxed max-h-24 overflow-y-auto">
                      {generatedWords.join(" ")}
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs rounded-xl transition"
                >
                  Generate Key Pair & Create Account
                </button>
              </form>
            )}

            {/* RECOVERY FORM */}
            {authTab === "RECOVER" && (
              <form onSubmit={handleRecover} className="space-y-4">
                <div>
                  <label className="block text-xs text-stone-400 mb-1">Username</label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. ashish"
                    className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-stone-400 mb-1">24-Word Recovery Phrase</label>
                  <textarea
                    rows={3}
                    required
                    value={recoveryPhraseInput}
                    onChange={(e) => setRecoveryPhraseInput(e.target.value)}
                    placeholder="anchor beacon castle dragon..."
                    className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-xs font-mono text-stone-100 focus:outline-none focus:border-amber-500 resize-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-stone-400 mb-1">New Vault Password (Optional Reset)</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs rounded-xl transition"
                >
                  Recover Encryption Key
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
};
