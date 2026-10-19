import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { Check, ExternalLink, Loader2 } from 'lucide-react';
import { fetchContractStatus, signContract, type ContractStatus } from './contract.api';

const HOLD_MS = 1200;
const LATER_KEY = 'blockminer:contract-later';
const PARCHMENT = '/contract/contract-parchment.webp';
const SEAL = '/contract/contract-seal.webp';

function readLater(version: string): boolean {
  try {
    return sessionStorage.getItem(LATER_KEY) === version;
  } catch {
    return false;
  }
}

function otherDialogOpen(self: HTMLElement | null): boolean {
  return Array.from(document.querySelectorAll('[role="dialog"]')).some((el) => !self || !self.contains(el));
}

/** "Miner's Contract": stamp every key clause of the Terms of Use, then hold the wax seal to sign. */
export default function MinerContractModal() {
  const { t } = useTranslation();
  const location = useLocation();
  const [status, setStatus] = useState<ContractStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [stamped, setStamped] = useState<Set<string>>(new Set());
  const [hold, setHold] = useState(0);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState(false);
  const [justSigned, setJustSigned] = useState<ContractStatus | null>(null);
  const holdTimer = useRef<number | null>(null);
  const holdStart = useRef(0);
  const selfRef = useRef<HTMLDivElement>(null);

  const onAdmin = location.pathname.startsWith('/admin');

  useEffect(() => {
    let cancelled = false;
    fetchContractStatus()
      .then((s) => !cancelled && setStatus(s))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Open only when needed, and never on top of another popup (e.g. a broadcast).
  useEffect(() => {
    if (!status || status.signed || open || onAdmin || readLater(status.version)) return;
    const id = window.setInterval(() => {
      if (!otherDialogOpen(null)) {
        setOpen(true);
        window.clearInterval(id);
      }
    }, 1500);
    return () => window.clearInterval(id);
  }, [status, open, onAdmin]);

  const allStamped = Boolean(status && status.clauses.every((c) => stamped.has(c)));

  const stopHold = useCallback(() => {
    if (holdTimer.current != null) window.clearInterval(holdTimer.current);
    holdTimer.current = null;
    if (!signing) setHold(0);
  }, [signing]);

  const doSign = useCallback(async () => {
    if (!status || signing) return;
    setSigning(true);
    setError(false);
    try {
      const s = await signContract(status.version, [...stamped]);
      setStatus(s);
      setJustSigned(s);
    } catch {
      setError(true);
      setHold(0);
    } finally {
      setSigning(false);
    }
  }, [status, stamped, signing]);

  const startHold = useCallback(() => {
    if (!allStamped || signing || holdTimer.current != null) return;
    holdStart.current = Date.now();
    holdTimer.current = window.setInterval(() => {
      const p = Math.min(1, (Date.now() - holdStart.current) / HOLD_MS);
      setHold(p);
      if (p >= 1) {
        if (holdTimer.current != null) window.clearInterval(holdTimer.current);
        holdTimer.current = null;
        void doSign();
      }
    }, 30);
  }, [allStamped, signing, doSign]);

  useEffect(() => () => stopHold(), [stopHold]);

  if (!open || !status || typeof document === 'undefined') return null;

  const later = () => {
    try {
      sessionStorage.setItem(LATER_KEY, status.version);
    } catch {
      /* private mode: just close */
    }
    setOpen(false);
  };
  const toggle = (id: string) => {
    if (justSigned) return;
    setStamped((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const count = status.clauses.filter((c) => stamped.has(c)).length;
  const total = status.clauses.length;

  return createPortal(
    <div
      ref={selfRef}
      className="fixed inset-0 z-[99998] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="miner-contract-title"
      data-testid="miner-contract"
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-[#e9d6ad] pt-20 shadow-[6px_6px_0px_#000000] sm:pt-[11%]"
        style={{ backgroundImage: `url(${PARCHMENT})`, backgroundSize: '100% 100%' }}
      >
        {/* Top padding lives outside the scroll area so text never scrolls over the corner art. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-[10%] pb-4 text-[#3b2a17]">
          <p className="text-center text-[10px] font-black uppercase tracking-[0.3em] text-[#7a5a32]">{t('contract.eyebrow')}</p>
          <h2 id="miner-contract-title" className="mt-1 text-center font-serif text-2xl font-black sm:text-3xl">
            {t('contract.title')}
          </h2>
          <p className="mt-2 text-center text-xs font-semibold text-[#5c4326]">{t('contract.subtitle')}</p>

          <div className="mt-4" aria-live="polite">
            <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-[#7a5a32]">
              <span>{t('contract.progress', { count, total })}</span>
              <span>{Math.round((count / total) * 100)}%</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#d9c39b]">
              <div className="h-full rounded-full bg-[#3b82f6] transition-all duration-300" style={{ width: `${(count / total) * 100}%` }} />
            </div>
          </div>

          <ol className="mt-4 space-y-2">
            {status.clauses.map((id, i) => {
              const on = stamped.has(id);
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => toggle(id)}
                    aria-pressed={on}
                    data-testid={`clause-${id}`}
                    className={`flex w-full items-start gap-3 rounded-xl border-2 px-3 py-2 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] ${
                      on ? 'border-[#9b2c2c]/60 bg-[#f3e2c0]' : 'border-dashed border-[#a8875a]/70 bg-white/20 hover:bg-white/35'
                    }`}
                  >
                    <span className="relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center">
                      {on ? (
                        <img src={SEAL} alt="" className="h-8 w-8 animate-in zoom-in-150 fade-in duration-200" />
                      ) : (
                        <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-dashed border-[#a8875a] text-[11px] font-black text-[#7a5a32]">
                          {i + 1}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-black">{t(`contract.clauses.${id}.title`)}</span>
                      <span className="block text-xs leading-snug text-[#5c4326]">{t(`contract.clauses.${id}.text`)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          <a href="/terms-of-use" target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#1d4ed8] underline">
            {t('contract.full_terms')} <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <div className="border-t-2 border-[#a8875a]/50 bg-[#efdfbd]/90 px-6 py-4 sm:px-10">
          {justSigned ? (
            <div className="flex flex-col items-center gap-2 text-center text-[#3b2a17]" data-testid="contract-signed">
              <img src={SEAL} alt="" className="h-20 w-20 animate-in zoom-in-150 spin-in-12 duration-500" />
              <p className="font-serif text-lg font-black">{t('contract.signed_title')}</p>
              <p className="text-xs font-semibold">{t('contract.signed_text', { certificate: justSigned.certificate ?? '' })}</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="mt-1 inline-flex items-center gap-2 rounded-xl bg-[#1d4ed8] px-6 py-3 text-xs font-black uppercase tracking-wider text-white shadow-[2px_2px_0px_#000000] hover:bg-[#1e40af]"
              >
                <Check className="h-4 w-4" /> {t('contract.lets_mine')}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <button
                type="button"
                disabled={!allStamped || signing}
                onPointerDown={startHold}
                onPointerUp={stopHold}
                onPointerLeave={stopHold}
                onPointerCancel={stopHold}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
                    e.preventDefault();
                    startHold();
                  }
                }}
                onKeyUp={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') stopHold();
                }}
                aria-label={t('contract.hold_to_sign')}
                data-testid="contract-seal"
                className="relative h-20 w-20 shrink-0 touch-none select-none rounded-full transition-transform enabled:hover:scale-105 enabled:active:scale-95 disabled:opacity-40 disabled:grayscale focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#3b82f6]"
              >
                <svg className="absolute inset-0 -rotate-90" viewBox="0 0 80 80" aria-hidden>
                  <circle cx="40" cy="40" r="37" fill="none" stroke="#d9c39b" strokeWidth="5" />
                  <circle cx="40" cy="40" r="37" fill="none" stroke="#3b82f6" strokeWidth="5" strokeDasharray={2 * Math.PI * 37} strokeDashoffset={2 * Math.PI * 37 * (1 - hold)} strokeLinecap="round" />
                </svg>
                <img src={SEAL} alt="" draggable={false} className="absolute inset-[7px] h-[66px] w-[66px]" />
                {signing ? <Loader2 className="absolute inset-0 m-auto h-6 w-6 animate-spin text-white" /> : null}
              </button>
              <div className="min-w-0 flex-1 text-[#3b2a17]">
                <p className="text-sm font-black">{allStamped ? t('contract.hold_to_sign') : t('contract.stamp_all_first', { left: total - count })}</p>
                {error ? <p className="text-xs font-bold text-red-700">{t('contract.sign_failed')}</p> : null}
                <button type="button" onClick={later} className="mt-1 text-[11px] font-bold text-[#7a5a32] underline">
                  {t('contract.later')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
