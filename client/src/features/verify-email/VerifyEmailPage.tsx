import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, CheckCircle2, AlertCircle, MailCheck } from 'lucide-react';
import BrandLogo from '../../shared/components/BrandLogo';
import Card from '../../shared/components/Card';
import IconBadge from '../../shared/components/IconBadge';
import { api, useAuthStore } from '../../shared/auth/auth.store';
import { resolveApiErrorMessage } from '../../shared/utils/apiErrorI18n';
import SiteFooter from '../../shared/components/SiteFooter';

/**
 * item 95 Parte B (pentest blockminer.space) — consome `?token=` do link enviado por email
 * (`POST /api/auth/verify-email`) e mostra sucesso/erro. Página pública (não exige sessão —
 * o token na URL já é a prova de posse do email), mas se o usuário JÁ estiver logado (caso
 * comum: abriu o link no mesmo navegador em que já tinha feito login no registro), refaz a
 * checkSession pra o app parar de mostrar o banner de "confirme seu email" na hora.
 */
export default function VerifyEmailPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const checkSession = useAuthStore((s) => s.checkSession);
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setState('error');
      setErrorMessage(t('auth.verifyEmail.missing_token'));
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        await api.post('/auth/verify-email', { token });
        if (cancelled) return;
        setState('success');
        void checkSession({ silent: true });
      } catch (err) {
        if (cancelled) return;
        setState('error');
        setErrorMessage(resolveApiErrorMessage(err, t('auth.verifyEmail.error_body')));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, checkSession, t]);

  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px] animate-pulse delay-700" />

      <div className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-[440px] relative z-10">
        <div className="flex justify-center mb-6">
          <BrandLogo variant="auth" />
        </div>

        <Card spacing="md" className="text-center">
          <div className="flex flex-col items-center gap-4 pb-3 border-b-2 border-slate-800">
            <IconBadge icon={MailCheck} variant="sky" size="lg" />
            <h1 className="text-2xl font-black uppercase tracking-tight text-white">{t('auth.verifyEmail.title')}</h1>
          </div>
          {state === 'loading' ? (
            <div className="flex flex-col items-center gap-4 py-6">
              <Loader2 className="w-10 h-10 text-sky-400 animate-spin" />
              <p className="text-slate-300 text-sm font-medium">{t('auth.verifyEmail.loading')}</p>
            </div>
          ) : null}

          {state === 'success' ? (
            <div className="rounded-2xl border-2 border-emerald-500/40 bg-slate-950 p-5 flex flex-col items-center gap-3 shadow-[2px_2px_0px_#000000]">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              <p className="text-emerald-300 text-sm font-bold leading-relaxed">{t('auth.verifyEmail.success_body')}</p>
            </div>
          ) : null}

          {state === 'error' ? (
            <div className="rounded-2xl border-2 border-red-500/40 bg-slate-950 p-5 flex flex-col items-center gap-3 shadow-[2px_2px_0px_#000000]">
              <AlertCircle className="w-8 h-8 text-red-300" />
              <p className="text-red-300 text-sm font-bold leading-relaxed">{errorMessage}</p>
            </div>
          ) : null}

          <Link
            to="/dashboard"
            className="inline-block w-full py-4 px-6 bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-xl font-black text-sm uppercase tracking-widest shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5"
          >
            {t('auth.verifyEmail.go_dashboard')}
          </Link>
        </Card>

        <div className="mt-8 text-center">
          <Link
            to="/"
            className="text-slate-300 hover:text-white text-xs font-black uppercase tracking-[0.2em]"
          >
            {t('common.back')}
          </Link>
        </div>
      </div>
      </div>
      <div className="relative z-10">
        <SiteFooter />
      </div>
    </div>
  );
}
