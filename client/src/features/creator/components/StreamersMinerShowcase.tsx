import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MODEL_VIEWER_SCRIPT,
  STREAMERS_MINER_CAMERA_ORBIT,
  STREAMERS_MINER_FIELD_OF_VIEW,
  STREAMERS_MINER_GLB,
  STREAMERS_MINER_SPIN,
} from '../creator.constants';

let modelViewerScriptPromise: Promise<void> | null = null;

function loadModelViewer(): Promise<void> {
  if (modelViewerScriptPromise) return modelViewerScriptPromise;
  modelViewerScriptPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return resolve();
    if (customElements.get('model-viewer')) return resolve();
    const script = document.createElement('script');
    script.type = 'module';
    script.src = MODEL_VIEWER_SCRIPT;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('model-viewer failed to load'));
    document.head.appendChild(script);
  });
  return modelViewerScriptPromise;
}

function OrbitMiner() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let viewer: HTMLElement | null = null;

    void loadModelViewer()
      .then(() => {
        if (cancelled || !hostRef.current) return;
        viewer = document.createElement('model-viewer');
        const attrs: Record<string, string> = {
          src: STREAMERS_MINER_GLB,
          alt: 'Streamers Miners',
          'camera-controls': '',
          autoplay: '',
          'shadow-intensity': '0.4',
          exposure: '1',
          'tone-mapping': 'aces',
          'environment-image': 'neutral',
          'interaction-prompt': 'auto',
          'camera-orbit': STREAMERS_MINER_CAMERA_ORBIT,
          'field-of-view': STREAMERS_MINER_FIELD_OF_VIEW,
        };
        for (const [key, value] of Object.entries(attrs)) {
          viewer.setAttribute(key, value);
        }
        viewer.style.width = '100%';
        viewer.style.height = '100%';
        viewer.style.background = '#0B0F19';
        viewer.addEventListener('error', () => setFailed(true));
        hostRef.current.appendChild(viewer);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      viewer?.remove();
    };
  }, []);

  if (failed) {
    return <div className="w-full h-full bg-[#0B0F19]" />;
  }

  return <div ref={hostRef} className="w-full h-full" />;
}

export function StreamersMinerShowcase() {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <section className="space-y-2">
        <p className="text-sm font-black text-white">{t('ranking.social.miner_static_title')}</p>
        <p className="text-[10px] text-gray-500">{t('ranking.social.miner_static_body')}</p>
        <video
          className="w-full h-[280px] sm:h-[360px] rounded-2xl bg-[#0B0F19] object-contain"
          src={STREAMERS_MINER_SPIN}
          autoPlay
          muted
          loop
          playsInline
        />
      </section>
      <section className="space-y-2">
        <p className="text-sm font-black text-white">{t('ranking.social.miner_orbit_title')}</p>
        <p className="text-[10px] text-gray-500">{t('ranking.social.miner_orbit_body')}</p>
        <div className="w-full h-[280px] sm:h-[360px] rounded-2xl overflow-hidden bg-[#0B0F19]">
          <OrbitMiner />
        </div>
      </section>
    </div>
  );
}
