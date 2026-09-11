import { useEffect } from "react";
import { PauseCircle } from "lucide-react";
import { pausedTimerCopy, pausedTimerMessage, type PausedTimerContext } from "./lib/pausedTimer.copy";

interface PausedTimerBannerProps {
  show: boolean;
  onDismiss: () => void;
  /** auto-dismiss after N ms (default 5000). Set 0 to keep until dismissed. */
  autoDismissMs?: number;
  context?: PausedTimerContext;
}

export default function PausedTimerBanner({
  show,
  onDismiss,
  autoDismissMs = 5000,
  context = "generic",
}: PausedTimerBannerProps) {
  useEffect(() => {
    if (!show || autoDismissMs <= 0) return undefined;
    const id = setTimeout(() => onDismiss(), autoDismissMs);
    return () => clearTimeout(id);
  }, [show, autoDismissMs, onDismiss]);

  if (!show) return null;

  const message = pausedTimerMessage(context);

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-100/90 animate-in fade-in slide-in-from-top-2 duration-300"
    >
      <PauseCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-black uppercase tracking-widest text-amber-400">
          {pausedTimerCopy.title}
        </p>
        <p className="text-xs mt-1 leading-relaxed text-amber-100/85">{message}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="text-[10px] font-black uppercase tracking-widest text-amber-300 hover:text-amber-200 px-2 py-1 rounded-lg hover:bg-amber-500/10 transition-colors"
      >
        {pausedTimerCopy.dismiss}
      </button>
    </div>
  );
}
