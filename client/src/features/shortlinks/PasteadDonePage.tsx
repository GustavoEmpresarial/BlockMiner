import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { isAxiosError } from 'axios';
import { reportApiFailure } from '../../shared/utils/reportApiFailure';
import { markPasteadDone, readApiErrorMessage } from './lib/shortlinks.api';
import { broadcastPasteadDone } from './lib/pasteadSession';
import { syncPasteadToken } from './lib/pasteadStorage';

export default function PasteadDonePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return undefined;
    started.current = true;

    const token = params.get('t')?.trim() ?? '';
    if (token) syncPasteadToken(token);

    let cancelled = false;

    void (async () => {
      if (!token) {
        navigate('/shortlinks', { replace: true });
        return;
      }
      try {
        const res = await markPasteadDone(token);
        if (cancelled) return;
        if (!res.ok) {
          reportApiFailure({
            operation: 'pastead_shortlink_mark_done',
            message: res.message || 'mark_done_failed',
            code: res.code,
          });
          navigate('/shortlinks/pastead/failed', { replace: true });
          return;
        }
        broadcastPasteadDone(res.token || token);
        navigate('/shortlinks', { replace: true });
      } catch (err) {
        if (cancelled) return;
        reportApiFailure(
          {
            operation: 'pastead_shortlink_mark_done',
            message: readApiErrorMessage(err, 'mark_done_failed'),
            statusCode: isAxiosError(err) ? err.response?.status : undefined,
          },
          err,
        );
        navigate('/shortlinks/pastead/failed', { replace: true });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate, params]);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-sky-400" />
      <p className="text-sm font-bold text-gray-300">
        {t('shortlinks.pastead_auto_validating', { defaultValue: 'Validating shortlink…' })}
      </p>
      <p className="text-xs font-medium text-gray-500">
        {t('shortlinks.pastead_auto_validating_hint', { defaultValue: 'You can return to the main tab shortly.' })}
      </p>
    </div>
  );
}
