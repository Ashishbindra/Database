/**
 * ThreatModelView - Transparent Threat Matrix & Protection Guarantees
 */

import React from "react";
import { THREAT_MODEL } from "../../docs/threatModel";
import { ShieldAlert, CheckCircle2, AlertTriangle, FileText } from "lucide-react";

export const ThreatModelView: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="p-6 bg-stone-900 border border-stone-800 rounded-2xl">
        <div className="flex items-center gap-2 mb-2">
          <ShieldAlert className="w-5 h-5 text-amber-400" />
          <h2 className="text-xl font-bold text-stone-100">Threat Model & Security Matrix</h2>
        </div>
        <p className="text-xs text-stone-400 leading-relaxed max-w-3xl">
          Realistic documentation of protections, cryptographic boundaries, and platform limitations. This system provides true Zero-Knowledge End-to-End Encryption without making false security claims.
        </p>
      </div>

      <div className="space-y-3">
        {THREAT_MODEL.map((item) => (
          <div key={item.id} className="p-5 bg-stone-900 border border-stone-800 rounded-xl space-y-3">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-stone-500">{item.id}</span>
                <h3 className="text-sm font-bold text-stone-100">{item.threat}</h3>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-stone-500">Ref: {item.requirementRef}</span>
                {item.status === "PROTECTED" ? (
                  <span className="px-2.5 py-0.5 text-xs font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Fully Protected
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 text-xs font-mono font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-400" /> Documented Limitation
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs bg-stone-950 p-3 rounded-lg border border-stone-800/80">
              <div>
                <span className="text-stone-500 font-mono text-[10px] block mb-1">Attack Vector:</span>
                <p className="text-stone-300">{item.vector}</p>
              </div>
              <div>
                <span className="text-amber-400/80 font-mono text-[10px] block mb-1">Architectural Mitigation:</span>
                <p className="text-stone-300">{item.mitigation}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
