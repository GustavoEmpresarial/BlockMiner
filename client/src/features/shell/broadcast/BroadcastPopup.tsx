import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../shared/auth/auth.store';

type BroadcastMessage = {
  id: number;
  title: string;
  content?: string | null;
  imageUrl?: string | null;
  dismissDelaySeconds?: number;
  linkUrl?: string | null;
  linkLabel?: string | null;
  linkNewTab?: boolean;
};

/**
 * Post-login popup for Admin → Notificações broadcast (`GET /api/broadcast/active`).
 * Mount once inside the authenticated shell (ProtectedLayout).
 */
export default function BroadcastPopup() {
  const [msg, setMsg] = useState<BroadcastMessage | null>(null);
  const [remaining, setRemaining] = useState(0);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<{ ok: boolean; message?: BroadcastMessage | null }>('/broadcast/active');
      if (!data.ok || !data.message) {
        setMsg(null);
        return;
      }
      setMsg(data.message);
      setRemaining(Math.max(0, Math.min(120, Number(data.message.dismissDelaySeconds) || 0)));
    } catch {
      /* not authenticated or transient */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!msg || remaining <= 0) return;
    const id = window.setInterval(() => setRemaining((n) => Math.max(0, n - 1)), 1000);
    return () => window.clearInterval(id);
  }, [msg, remaining > 0]);

  const dismiss = async () => {
    if (!msg || remaining > 0) return;
    const id = msg.id;
    setMsg(null);
    try {
      await api.post(`/broadcast/${id}/dismiss`);
    } catch {
      /* best-effort */
    }
  };

  if (!msg) return null;

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bm-broadcast-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-700/80 bg-gradient-to-b from-slate-900 to-slate-950 p-5 shadow-2xl">
        <div className="mb-2 inline-block rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-300">
          Aviso
        </div>
        <h2 id="bm-broadcast-title" className="mb-3 text-xl font-extrabold tracking-tight text-white">
          {msg.title}
        </h2>
        {msg.imageUrl ? (
          <img src={msg.imageUrl} alt="" className="mb-3 max-h-44 w-full rounded-xl object-cover" />
        ) : null}
        {msg.content ? (
          <p className="mb-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{msg.content}</p>
        ) : null}
        <div className="grid gap-2">
          {msg.linkUrl && msg.linkLabel ? (
            <a
              href={msg.linkUrl}
              target={msg.linkNewTab ? '_blank' : undefined}
              rel={msg.linkNewTab ? 'noopener noreferrer' : undefined}
              className="rounded-xl border border-slate-600/60 bg-slate-800/60 px-4 py-2.5 text-center text-sm font-bold text-slate-100"
            >
              {msg.linkLabel}
            </a>
          ) : null}
          <button
            type="button"
            disabled={remaining > 0}
            onClick={() => void dismiss()}
            className="rounded-xl bg-amber-400 px-4 py-3 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {remaining > 0 ? `Entendi (${remaining}s)` : 'Entendi'}
          </button>
        </div>
      </div>
    </div>
  );
}
