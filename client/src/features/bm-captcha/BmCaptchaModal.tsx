import { useEffect, useMemo, useState } from 'react';
import { api } from '../../shared/auth/auth.store';
import type { BmCaptchaChallenge, BmCaptchaProvider, BmCaptchaTile } from './bm-captcha.types';

const HUES = ['#22d3ee', '#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#60a5fa', '#fb7185', '#c084fc'];

const SHAPES = [
  'M50 12 L78 38 L68 78 L32 78 L22 38 Z',
  'M50 14 L86 50 L50 86 L14 50 Z',
  'M28 28 H72 V72 H28 Z',
  'M50 18 L82 72 H18 Z',
  'M20 50 Q50 10 80 50 Q50 90 20 50',
  'M50 16 L60 40 L86 42 L66 60 L72 86 L50 72 L28 86 L34 60 L14 42 L40 40 Z',
];

function TileGlyph({ tile, size = 64 }: { tile: BmCaptchaTile; size?: number }) {
  const hue = HUES[(tile.hue || 0) % HUES.length];
  const d = SHAPES[(tile.shape || 0) % SHAPES.length];
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <rect width="100" height="100" rx="14" fill="#0f172a" />
      <g transform={`rotate(${tile.rot || 0} 50 50)`}>
        <path d={d} fill={hue} opacity={0.92} />
      </g>
    </svg>
  );
}

function Crystal({ points, deg }: { points: Array<{ x: number; y: number }>; deg: number }) {
  const d = useMemo(() => {
    return (
      points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(50 + p.x * 0.7).toFixed(2)} ${(50 + p.y * 0.7).toFixed(2)}`).join(' ') +
      ' Z'
    );
  }, [points]);
  return (
    <svg width={180} height={180} viewBox="0 0 100 100" className="touch-none select-none">
      <circle cx="50" cy="50" r="46" fill="none" stroke="#334155" strokeWidth="2" />
      <line x1="50" y1="6" x2="50" y2="16" stroke="#22d3ee" strokeWidth="3" strokeLinecap="round" />
      <defs>
        <linearGradient id="bmCrystalGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      <g transform={`rotate(${deg} 50 50)`}>
        <path d={d} fill="url(#bmCrystalGrad)" stroke="#e2e8f0" strokeWidth="1.2" />
      </g>
    </svg>
  );
}

async function sha256Hex(str: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function solvePow(prefix: string, difficulty: number): Promise<number> {
  if (!difficulty) return 0;
  const zeros = '0'.repeat(difficulty);
  for (let c = 0; c < 5_000_000; c++) {
    const h = await sha256Hex(`${prefix}:${c}`);
    if (h.startsWith(zeros)) return c;
    if (c % 250 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  return 0;
}

type Props = {
  provider: BmCaptchaProvider;
  onSuccess: (passToken: string) => void;
  onCancel: () => void;
};

export function BmCaptchaModal({ provider, onSuccess, onCancel }: Props) {
  const [challenge, setChallenge] = useState<BmCaptchaChallenge | null>(null);
  const [dialDeg, setDialDeg] = useState(0);
  const [tileId, setTileId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const res = await api.post('/bm-captcha/challenge', {
          purpose: 'offerwall_external',
          provider,
        });
        if (dead) return;
        // Server may return CAPTCHA_DISABLED (503) while BM_CAPTCHA_ENABLED=0.
        if (res.data?.code === 'CAPTCHA_DISABLED' || res.status === 503) {
          onSuccess('');
          return;
        }
        if (!res.data?.challenge) {
          setError(res.data?.code || 'CAPTCHA_MINT_FAILED');
          return;
        }
        setChallenge(res.data.challenge);
        setDialDeg(Math.floor(Math.random() * 360));
      } catch (e: unknown) {
        const code =
          e && typeof e === 'object' && 'response' in e
            ? (e as { response?: { data?: { code?: string }; status?: number } }).response?.data?.code
            : undefined;
        const status =
          e && typeof e === 'object' && 'response' in e
            ? (e as { response?: { status?: number } }).response?.status
            : undefined;
        if (!dead && (code === 'CAPTCHA_DISABLED' || status === 503)) {
          onSuccess('');
          return;
        }
        if (!dead) setError(code || 'CAPTCHA_MINT_FAILED');
      }
    })();
    return () => {
      dead = true;
    };
  }, [provider]);

  const submit = async () => {
    if (!challenge || tileId == null || busy) return;
    setBusy(true);
    setError(null);
    try {
      const powCounter = await solvePow(challenge.pow.prefix, challenge.pow.difficulty);
      const res = await api.post('/bm-captcha/verify', {
        challengeId: challenge.challengeId,
        dialDeg,
        tileId,
        powCounter,
      });
      if (res.data?.ok && res.data.passToken) {
        onSuccess(res.data.passToken);
        return;
      }
      setError(res.data?.code || 'SOLUTION_WRONG');
    } catch (e: unknown) {
      const code = (e as { response?: { data?: { code?: string } } })?.response?.data?.code;
      setError(code || 'VERIFY_FAILED');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[2147483000] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900 to-slate-950 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-[11px] tracking-[0.14em] uppercase text-cyan-300 font-bold">BlockMiner</p>
            <h2 className="text-lg font-bold text-white">Verificação humana</h2>
          </div>
          <button type="button" onClick={onCancel} className="text-slate-400 hover:text-white text-xl leading-none">
            ×
          </button>
        </div>
        <p className="text-sm text-slate-400 mb-4">
          Gire o cristal até ficar em pé, escolha a peça igual e confirme.
        </p>
        {!challenge ? (
          <p className="text-sm text-slate-500 py-10 text-center">Carregando…</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-col items-center">
              <Crystal points={challenge.dialPoints} deg={dialDeg} />
              <input
                type="range"
                min={0}
                max={359}
                value={Math.round(dialDeg)}
                onChange={(e) => setDialDeg(Number(e.target.value))}
                className="w-full accent-cyan-400 mt-2"
              />
            </div>
            <p className="text-xs text-slate-300 font-semibold">Qual peça é igual a esta?</p>
            <div className="flex justify-center">
              <TileGlyph tile={challenge.targetTilePreview} size={72} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {challenge.tiles.map((tile) => (
                <button
                  key={tile.id}
                  type="button"
                  onClick={() => setTileId(tile.id)}
                  className={`rounded-xl border-2 p-1 ${tileId === tile.id ? 'border-cyan-400' : 'border-slate-800'}`}
                >
                  <TileGlyph tile={tile} size={56} />
                </button>
              ))}
            </div>
          </div>
        )}
        {error ? <p className="text-xs text-rose-400 mt-3">{error}</p> : null}
        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-slate-700 py-2.5 text-slate-200 font-semibold"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy || tileId == null || !challenge}
            onClick={() => void submit()}
            className="flex-[1.4] rounded-xl bg-gradient-to-r from-cyan-600 to-violet-600 py-2.5 text-white font-bold disabled:opacity-50"
          >
            {busy ? 'Validando…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}
