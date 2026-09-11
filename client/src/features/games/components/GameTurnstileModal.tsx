/**
 * Modal that collects a Cloudflare Turnstile token before a gated mini-game action.
 */
import { useRef, useState } from 'react';
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

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <h2 className="text-lg font-black uppercase tracking-wide text-white">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">{body}</p>
        {!siteKey ? (
          <p className="mt-4 text-sm font-semibold text-red-300">
            Turnstile não configurado neste cliente. Avise o suporte.
          </p>
        ) : (
          <TurnstileField ref={ref} siteKey={siteKey} onToken={setToken} />
        )}
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-slate-600 py-3 text-xs font-bold uppercase tracking-widest text-slate-300"
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
            className="flex-1 rounded-xl bg-sky-500 py-3 text-xs font-black uppercase tracking-widest text-slate-950 disabled:opacity-40"
          >
            Continuar
          </button>
        </div>
      </div>
    </div>
  );
}
