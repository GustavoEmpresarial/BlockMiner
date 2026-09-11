import { useEffect, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { toast } from 'sonner';

const YT_API_LOAD_TIMEOUT_MS = 20_000;
const YT_API_POLL_MS = 250;

export function useYoutubeIframeApi(t: TFunction): { ytApiReady: boolean; ytApiFailed: boolean } {
  const booted = useRef(false);
  const [ytApiReady, setYtApiReady] = useState(() => Boolean(window.YT?.Player));
  const [ytApiFailed, setYtApiFailed] = useState(false);

  useEffect(() => {
    const markReady = () => {
      booted.current = true;
      setYtApiReady(true);
      setYtApiFailed(false);
    };

    if (window.YT?.Player) {
      markReady();
      return undefined;
    }

    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      markReady();
      if (typeof prev === 'function') prev();
    };

    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      document.head.appendChild(script);
    }

    const poll = window.setInterval(() => {
      if (window.YT?.Player) {
        markReady();
        window.clearInterval(poll);
      }
    }, YT_API_POLL_MS);

    const timeout = window.setTimeout(() => {
      window.clearInterval(poll);
      if (!window.YT?.Player) {
        setYtApiFailed(true);
        toast.error(t('youtube.api_load_failed'), { duration: 8000 });
      }
    }, YT_API_LOAD_TIMEOUT_MS);

    return () => {
      window.clearInterval(poll);
      window.clearTimeout(timeout);
    };
  }, [t]);

  return { ytApiReady, ytApiFailed };
}
