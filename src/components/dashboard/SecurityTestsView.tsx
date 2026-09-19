/**
 * SecurityTestsView - Interactive Security Test Suite & Automated Verifier
 */

import React, { useState } from "react";
import { SecurityTestResult } from "../../sdk/types";
import { ShieldCheck, Play, CheckCircle2, XCircle, Clock, AlertCircle } from "lucide-react";

export const SecurityTestsView: React.FC = () => {
  const [testResults, setTestResults] = useState<SecurityTestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const handleRunTests = async () => {
    setIsRunning(true);
    try {
      const response = await fetch("/api/testing/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }
      const data = await response.json();
      setTestResults(data.results || []);
    } catch (err) {
      console.error("Test runner error:", err);
    } finally {
      setIsRunning(false);
    }
  };

  const passedCount = testResults.filter((r) => r.status === "PASSED").length;
  const failedCount = testResults.filter((r) => r.status === "FAILED").length;

  return (
    <div className="space-y-6">
      <div className="p-6 bg-stone-900 border border-stone-800 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full">
              Automated Compliance Suite
            </span>
          </div>
          <h2 className="text-xl font-bold text-stone-100 mt-2">Security & Cryptographic Assertions</h2>
          <p className="text-stone-400 text-xs">
            Run live WebCrypto tests for AES-256-GCM AEAD tag verification, key unwrapping, tampered ciphertext rejection, and multi-app data isolation.
          </p>
        </div>

        <button
          onClick={handleRunTests}
          disabled={isRunning}
          className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-bold text-xs rounded-xl flex items-center gap-2 transition disabled:opacity-50"
        >
          <Play className={`w-4 h-4 fill-current ${isRunning ? "animate-pulse" : ""}`} />
          {isRunning ? "Executing Test Suite..." : "Run Security Test Suite"}
        </button>
      </div>

      {/* Summary Bar */}
      {testResults.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 bg-stone-900 border border-stone-800 rounded-xl flex items-center justify-between">
            <span className="text-xs text-stone-400">Total Assertions</span>
            <span className="text-sm font-mono font-bold text-stone-100">{testResults.length}</span>
          </div>
          <div className="p-4 bg-stone-900 border border-emerald-500/20 bg-emerald-500/5 rounded-xl flex items-center justify-between">
            <span className="text-xs text-emerald-400 font-medium">Passed</span>
            <span className="text-sm font-mono font-bold text-emerald-400">{passedCount}</span>
          </div>
          <div className="p-4 bg-stone-900 border border-red-500/20 bg-red-500/5 rounded-xl flex items-center justify-between">
            <span className="text-xs text-red-400 font-medium">Failed</span>
            <span className="text-sm font-mono font-bold text-red-400">{failedCount}</span>
          </div>
        </div>
      )}

      {/* Test List */}
      <div className="space-y-3">
        {testResults.length === 0 ? (
          <div className="p-12 text-center bg-stone-900/50 border border-stone-800 rounded-2xl text-stone-500">
            <ShieldCheck className="w-12 h-12 text-stone-600 mx-auto mb-3" />
            <p className="text-sm">Click "Run Security Test Suite" above to execute all 30+ protocol verification tests live in your browser.</p>
          </div>
        ) : (
          testResults.map((t) => (
            <div
              key={t.id}
              className={`p-4 border rounded-xl transition ${
                t.status === "PASSED"
                  ? "bg-stone-900/80 border-stone-800 hover:border-stone-700"
                  : "bg-red-500/10 border-red-500/30 text-red-200"
              }`}
            >
              <div className="flex justify-between items-start gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-stone-500 font-bold">{t.id}</span>
                    <span className="px-2 py-0.5 text-[10px] font-mono bg-stone-800 text-amber-400 rounded">
                      {t.category}
                    </span>
                    <h4 className="text-sm font-bold text-stone-100">{t.name}</h4>
                  </div>
                  <p className="text-xs text-stone-400 font-mono pl-0.5">{t.message}</p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px] font-mono text-stone-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {t.durationMs}ms
                  </span>
                  {t.status === "PASSED" ? (
                    <span className="px-2.5 py-1 text-xs font-mono font-bold bg-emerald-500/20 text-emerald-300 rounded-lg flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> PASSED
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 text-xs font-mono font-bold bg-red-500/20 text-red-300 rounded-lg flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5 text-red-400" /> FAILED
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
