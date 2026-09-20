import React from "react";
import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from "lucide-react";
import { ApiAlert } from "../types";

interface AlertBannerProps {
  alert: ApiAlert | null;
  onDismiss: () => void;
}

export const AlertBanner: React.FC<AlertBannerProps> = ({ alert, onDismiss }) => {
  if (!alert) return null;

  const styles = {
    success: "bg-emerald-950/80 border-emerald-500/50 text-emerald-200",
    error: "bg-rose-950/80 border-rose-500/50 text-rose-200",
    warning: "bg-amber-950/80 border-amber-500/50 text-amber-200",
    info: "bg-cyan-950/80 border-cyan-500/50 text-cyan-200",
  };

  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />,
    error: <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />,
    info: <Info className="w-5 h-5 text-cyan-400 shrink-0" />,
  };

  return (
    <div
      id="alert-banner"
      className={`p-4 rounded-xl border flex items-start justify-between gap-3 shadow-lg backdrop-blur-sm transition-all duration-200 ${styles[alert.type]}`}
    >
      <div className="flex items-start gap-3">
        {icons[alert.type]}
        <div>
          <div className="font-semibold text-sm flex items-center gap-2">
            {alert.title}
            {alert.status && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-900/60 border border-slate-700/60 font-mono">
                HTTP {alert.status}
              </span>
            )}
          </div>
          <p className="text-xs mt-0.5 opacity-90 leading-relaxed break-words">{alert.message}</p>
        </div>
      </div>
      <button
        id="dismiss-alert-button"
        onClick={onDismiss}
        className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-slate-200 transition-colors"
        aria-label="Dismiss alert"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
