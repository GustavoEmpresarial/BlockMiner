/**
 * Modal that collects a Cloudflare Turnstile token before a gated mini-game action.
 */
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import TurnstileField, {
  type TurnstileFieldHandle,
} from '../../../shared/components/auth/TurnstileField';
import { resolveTurnstileSiteKey } from '../../../shared/constants/turnstilePublic';

type Props = {
  open: boolean;
  title?: string;
  body?: string;
  onCancel: () => void;
  onSolved: (token: string) => void;
};

export function GameTurnstileModal({
  open,
  title = 'Verificação humana',
  body = 'A cada algumas partidas pedimos uma verificação rápida da Cloudflare para liberar a recompensa.',
  onCancel,
  onSolved,
}: Props) {
  const siteKey = resolveTurnstileSiteKey();
  const [token, setToken] = useState('');
  const ref = useRef<TurnstileFieldHandle | null>(null);

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="turnstile-modal-title"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="w-full max-w-md rounded-3xl border-2 border-slate-800 bg-slate-900 p-6 sm:p-7 shadow-[4px_4px_0px_#000000] animate-in zoom-in-95 duration-200">
        <h2 id="turnstile-modal-title" className="text-lg font-black uppercase tracking-wide text-white">{title}</h2>
        <p className="mt-2 text-xs sm:text-sm leading-relaxed text-slate-300 font-medium">{body}</p>
        {!siteKey ? (
          <p className="mt-4 text-xs font-bold text-red-400">
            Turnstile não configurado neste cliente. Avise o suporte.
          </p>
        ) : (
          <div className="mt-4">
            <TurnstileField ref={ref} siteKey={siteKey} onToken={setToken} />
          </div>
        )}
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border-2 border-slate-700 bg-slate-800/80 py-3 text-xs font-black uppercase tracking-wider text-slate-300 hover:text-white hover:bg-slate-700 active:translate-x-0.5 active:translate-y-0.5 transition-all shadow-[2px_2px_0px_#000000] outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!token}
            onClick={() => {
              if (!token) return;
              onSolved(token);
              setToken('');
              ref.current?.reset();
            }}
            className="flex-1 rounded-xl bg-sky-500 hover:bg-sky-400 py-3 text-xs font-black uppercase tracking-wider text-slate-950 active:translate-x-0.5 active:translate-y-0.5 transition-all shadow-[2px_2px_0px_#000000] disabled:opacity-40 outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            Continuar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
