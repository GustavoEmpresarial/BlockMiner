import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Download, Loader2, X } from 'lucide-react';
import { LicenseCertificate } from '../../offers/components/LicenseCertificate';
import {
  avatarErrorCode,
  fetchAvatarStatus,
  isValidHolderName,
  newIdempotencyKey,
  purchaseAvatarLicense,
  requestAvatarCertificate,
  type AvatarChannel,
  type AvatarCurrency,
} from '../lib/avatar.api';

type Step = 'confirm' | 'paying' | 'generating' | 'done' | 'generate_failed';

type Props = {
  currency: AvatarCurrency;
  amount: string;
  channel: AvatarChannel;
  onClose: () => void;
  /** Called after payment so the page refreshes balances/status. */
  onPaid: () => void | Promise<void>;
};

const POLL_MS = 4000;
const POLL_MAX_MS = 4 * 60_000;

/** Purchase confirmation with the certificate: type the name, pay, and the AI certificate is generated right away. */
export default function LicensePurchaseModal({ currency, amount, channel, onClose, onPaid }: Props) {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState('');
  const [step, setStep] = useState<Step>('confirm');
  const [error, setError] = useState<string | null>(null);
  const [certUrl, setCertUrl] = useState<string | null>(null);
  const attemptKey = useRef(newIdempotencyKey());
  const valid = isValidHolderName(name);

  const errorText = (err: unknown) => {
    const code = avatarErrorCode(err);
    return code ? t(`profilePhoto.errors.${code}`, { defaultValue: t('profilePhoto.errors.generic') }) : t('profilePhoto.errors.generic');
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (step === 'confirm' || step === 'done' || step === 'generate_failed')) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, onClose]);

  // Wait for the generated certificate.
  useEffect(() => {
    if (step !== 'generating') return;
    const started = Date.now();
    const id = window.setInterval(async () => {
      try {
        const s = await fetchAvatarStatus();
        const c = s.certificate;
        if (c?.status === 'ready' && c.url) {
          setCertUrl(c.url);
          setStep('done');
        } else if (c?.status === 'failed' || Date.now() - started > POLL_MAX_MS) {
          setStep('generate_failed');
        }
      } catch {
        /* keep polling */
      }
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [step]);

  async function confirm() {
    if (!valid || step !== 'confirm') return;
    setError(null);
    setStep('paying');
    try {
      await purchaseAvatarLicense(currency, amount, attemptKey.current, channel);
    } catch (err) {
      setError(errorText(err));
      if (avatarErrorCode(err) === 'AVATAR_QUOTE_CHANGED') attemptKey.current = newIdempotencyKey();
      setStep('confirm');
      return;
    }
    void onPaid();
    try {
      await requestAvatarCertificate(name, i18n.language || 'en');
      setStep('generating');
    } catch (err) {
      setError(errorText(err));
      setStep('generate_failed');
    }
  }

  const closable = step === 'confirm' || step === 'done' || step === 'generate_failed';
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[99998] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="license-modal-title" data-testid="license-purchase-modal" data-step={step}>
      <div className="relative grid max-h-[94vh] w-full max-w-3xl grid-cols-1 gap-6 overflow-y-auto rounded-3xl border-2 border-sky-500/40 bg-slate-900 p-5 shadow-[6px_6px_0px_#000000] sm:p-7 md:grid-cols-[300px_1fr]">
        {closable ? (
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        ) : null}

        <div className="flex items-start justify-center">
          {step === 'done' && certUrl ? (
            <img src={certUrl} alt={`${t('profilePhoto.certificate_title')} — ${name}`} className="aspect-[3/4] w-full max-w-[300px] rounded-lg shadow-[4px_4px_0px_#000000]" data-testid="license-modal-final" />
          ) : (
            <div className="relative w-full">
              <LicenseCertificate holder={name} size="lg" />
              {step === 'generating' || step === 'paying' ? (
                <div className="absolute inset-0 mx-auto flex max-w-[300px] items-center justify-center rounded-lg bg-black/45">
                  <Loader2 className="h-10 w-10 animate-spin text-white" />
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 text-slate-200">
          <h2 id="license-modal-title" className="pr-8 text-xl font-black uppercase italic tracking-tight text-white">
            {step === 'done' ? t('profilePhoto.modal_done_title') : t('profilePhoto.modal_title')}
          </h2>

          {step === 'confirm' || step === 'paying' ? (
            <>
              <p className="text-sm text-slate-300">{t('profilePhoto.modal_intro')}</p>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400" htmlFor="license-modal-name">
                {t('profilePhoto.certificate_name_label')}
              </label>
              <input
                id="license-modal-name"
                autoFocus
                value={name}
                maxLength={24}
                disabled={step !== 'confirm'}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('profilePhoto.certificate_your_name')}
                className="w-full rounded-xl border-2 border-slate-700 bg-slate-950 px-3 py-2.5 text-sm font-bold text-white focus:border-primary focus:outline-none"
              />
              {name && !valid ? <p className="text-[11px] text-amber-300">{t('profilePhoto.errors.AVATAR_CERT_NAME_INVALID')}</p> : null}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs">
                <div className="flex justify-between"><span className="text-slate-400">{t('profilePhoto.modal_item')}</span><span className="font-bold text-white">{t('profilePhoto.offer_title')}</span></div>
                <div className="mt-1 flex justify-between"><span className="text-slate-400">{t('profilePhoto.amount')}</span><span className="font-mono font-bold text-white" data-testid="license-modal-amount">{amount} {currency}</span></div>
                <div className="mt-1 flex justify-between"><span className="text-slate-400">{t('profilePhoto.modal_validity')}</span><span className="font-bold text-white">{t('profilePhoto.certificate_validity')}</span></div>
              </div>
              {error ? <p className="text-xs font-bold text-red-400">{error}</p> : null}
              <button
                type="button"
                onClick={() => void confirm()}
                disabled={!valid || step !== 'confirm'}
                className="mt-auto inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-xs font-black uppercase tracking-wider text-white shadow-[2px_2px_0px_#000000] hover:bg-blue-700 disabled:opacity-50"
              >
                {step === 'paying' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t('profilePhoto.modal_confirm', { amount, currency })}
              </button>
            </>
          ) : null}

          {step === 'generating' ? (
            <p className="flex items-center gap-2 text-sm font-bold text-sky-300" data-testid="license-modal-generating">
              <Loader2 className="h-4 w-4 animate-spin" /> {t('profilePhoto.certificate_generating')}
            </p>
          ) : null}

          {step === 'done' && certUrl ? (
            <>
              <p className="text-sm text-slate-300">{t('profilePhoto.modal_done_text')}</p>
              <a href={certUrl} download="blockminer-certificate.webp" className="inline-flex w-fit items-center gap-1 text-xs font-bold text-sky-300 hover:underline">
                <Download className="h-3.5 w-3.5" /> {t('profilePhoto.certificate_download')}
              </a>
              <Link to="/settings" onClick={onClose} className="mt-auto inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-xs font-black uppercase tracking-wider text-white shadow-[2px_2px_0px_#000000] hover:bg-blue-700">
                {t('profilePhoto.go_to_settings')}
              </Link>
            </>
          ) : null}

          {step === 'generate_failed' ? (
            <>
              <p className="text-sm font-bold text-emerald-400">{t('profilePhoto.purchased')}</p>
              <p className="text-xs text-amber-300">{error ?? t('profilePhoto.modal_generate_later')}</p>
              <button type="button" onClick={onClose} className="mt-auto rounded-xl border-2 border-slate-700 px-5 py-3 text-xs font-black uppercase tracking-wider text-slate-200 hover:text-white">
                {t('common.close')}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
