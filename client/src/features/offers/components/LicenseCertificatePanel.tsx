import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Loader2, Sparkles } from 'lucide-react';
import { LicenseCertificate } from './LicenseCertificate';
import { avatarErrorCode, isValidHolderName, requestAvatarCertificate, type AvatarStatus } from '../../settings/lib/avatar.api';

type Props = { status: AvatarStatus; licensed: boolean; onRefresh: () => void | Promise<void> };

const POLL_MS = 4000;

/** Certificate column: preview before buying; after paying, the player types the name and the AI draws it. */
export function LicenseCertificatePanel({ status, licensed, onRefresh }: Props) {
  const { t, i18n } = useTranslation();
  const cert = status.certificate ?? null;
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // While the image is being generated, poll the status.
  useEffect(() => {
    if (cert?.status !== 'pending') return;
    const id = window.setInterval(() => void onRefresh(), POLL_MS);
    return () => window.clearInterval(id);
  }, [cert?.status, onRefresh]);

  if (cert?.status === 'ready' && cert.url) {
    return (
      <div className="space-y-2" data-testid="license-certificate-ready">
        <img
          src={cert.url}
          alt={t('profilePhoto.certificate_title')}
          className="mx-auto aspect-[3/4] w-full max-w-[220px] rounded-lg shadow-[4px_4px_0px_#000000]"
          loading="lazy"
        />
        <a
          href={cert.url}
          download="blockminer-certificate.webp"
          className="mx-auto flex w-fit items-center gap-1 text-[11px] font-bold text-sky-300 hover:underline"
        >
          <Download className="h-3 w-3" /> {t('profilePhoto.certificate_download')}
        </a>
        {cert.attemptsLeft > 0 ? <p className="text-center text-[10px] text-slate-500">{t('profilePhoto.certificate_redo_hint', { count: cert.attemptsLeft })}</p> : null}
        {cert.attemptsLeft > 0 ? nameForm() : null}
      </div>
    );
  }

  const pending = cert?.status === 'pending';
  return (
    <div className="space-y-3">
      <LicenseCertificate holder={licensed ? cert?.holderName ?? (name.trim() || null) : null} />
      {licensed && pending ? (
        <p className="flex items-center justify-center gap-2 text-xs font-bold text-sky-300" data-testid="certificate-pending">
          <Loader2 className="h-4 w-4 animate-spin" /> {t('profilePhoto.certificate_generating')}
        </p>
      ) : null}
      {licensed && !pending ? nameForm() : null}
    </div>
  );

  function nameForm() {
    const left = cert?.attemptsLeft ?? 2;
    const valid = isValidHolderName(name);
    async function submit() {
      if (!valid || busy || left <= 0) return;
      setBusy(true);
      setError(null);
      try {
        await requestAvatarCertificate(name, i18n.language || 'en');
      } catch (err) {
        const code = avatarErrorCode(err);
        setError(code ? t(`profilePhoto.errors.${code}`, { defaultValue: t('profilePhoto.errors.generic') }) : t('profilePhoto.errors.generic'));
      } finally {
        setBusy(false);
        await onRefresh();
      }
    }
    if (left <= 0) return null;
    return (
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        data-testid="certificate-form"
      >
        {cert?.status === 'failed' ? <p className="text-[11px] font-bold text-red-400">{t('profilePhoto.errors.AVATAR_CERT_PROVIDER_FAILED')}</p> : null}
        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400" htmlFor="certificate-name">
          {t('profilePhoto.certificate_name_label')}
        </label>
        <input
          id="certificate-name"
          value={name}
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('profilePhoto.certificate_your_name')}
          className="w-full rounded-xl border-2 border-slate-700 bg-slate-950 px-3 py-2 text-sm font-bold text-white focus:border-primary focus:outline-none"
        />
        {name && !valid ? <p className="text-[10px] text-amber-300">{t('profilePhoto.errors.AVATAR_CERT_NAME_INVALID')}</p> : null}
        {error ? <p className="text-[10px] font-bold text-red-400">{error}</p> : null}
        <button
          type="submit"
          disabled={!valid || busy}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-[2px_2px_0px_#000000] hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {t('profilePhoto.certificate_generate', { count: left })}
        </button>
      </form>
    );
  }
}
