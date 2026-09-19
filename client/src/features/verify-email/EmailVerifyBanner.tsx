import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { api, useAuthStore } from '../../shared/auth/auth.store';
import { resolveApiErrorMessage } from '../../shared/utils/apiErrorI18n';

/**
 * Contas novas nascem com emailVerified=false. Saque e chat exigem o link do e-mail,
 * mas até aqui o cliente descartava o flag e não havia botão de reenvio — o toast
 * "Confirme seu e-mail" não levava a lugar nenhum.
 */
export default function EmailVerifyBanner() {
  const { t } = useTranslation();
  const emailVerified = useAuthStore((s) => s.user?.emailVerified);
  const [sending, setSending] = useState(false);

  if (emailVerified !== false) return null;

  const resend = async () => {
    if (sending) return;
    setSending(true);
    try {
      await api.post('/auth/resend-verification');
      toast.success(t('auth.verifyEmail.banner_sent'));
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, t('common.error')));
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      role="status"
      className="mb-4 flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 sm:flex-row sm:items-center"
    >
      <Mail className="hidden h-5 w-5 shrink-0 text-amber-300 sm:block" aria-hidden />
      <p className="flex-1 text-sm font-medium leading-relaxed text-amber-100">
        {t('auth.verifyEmail.banner_body')}
      </p>
      <button
        type="button"
        onClick={() => void resend()}
        disabled={sending}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-[11px] font-black uppercase tracking-widest text-slate-950 transition-colors hover:bg-amber-400 disabled:opacity-50"
      >
        {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {t('auth.verifyEmail.banner_resend')}
      </button>
    </div>
  );
}
