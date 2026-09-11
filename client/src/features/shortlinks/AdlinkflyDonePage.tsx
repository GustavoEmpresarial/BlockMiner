import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { isAxiosError } from 'axios';
import { reportApiFailure } from '../../shared/utils/reportApiFailure';
import { markAdlinkflyDone, readApiErrorMessage } from './lib/shortlinks.api';
import { broadcastAdlinkflyDone } from './lib/adlinkflySession';
import { syncAdlinkflyToken } from './lib/adlinkflyStorage';

export default function AdlinkflyDonePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return undefined;
    started.current = true;

    const token = params.get('t')?.trim() ?? '';
    if (token) syncAdlinkflyToken(token);

    let cancelled = false;

    void (async () => {
      if (!token) {
        navigate('/shortlinks', { replace: true });
        return;
      }
      try {
        const res = await markAdlinkflyDone(token);
        if (cancelled) return;
        if (!res.ok) {
          reportApiFailure({
            operation: 'adlinkfly_shortlink_mark_done',
            message: res.message || 'mark_done_failed',
            code: res.code,
          });
          navigate('/shortlinks/adlinkfly/failed', { replace: true });
          return;
        }
        broadcastAdlinkflyDone(res.token || token);
        navigate('/shortlinks', { replace: true });
      } catch (err) {
        if (cancelled) return;
        reportApiFailure(
          {
            operation: 'adlinkfly_shortlink_mark_done',
            message: readApiErrorMessage(err, 'mark_done_failed'),
            statusCode: isAxiosError(err) ? err.response?.status : undefined,
          },
          err,
        );
        navigate('/shortlinks/adlinkfly/failed', { replace: true });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate, params]);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-sky-400" />
      <p className="text-sm font-bold text-gray-300">{t('shortlinks.pastead_auto_validating')}</p>
      <p className="text-xs font-medium text-gray-500">{t('shortlinks.pastead_auto_validating_hint')}</p>
    </div>
  );
}
