import { useEffect, useRef, useState } from 'react';

const OFFER_MODEL_VIEWER_SCRIPT =
  'https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js';

/** Closer than the default frame so the GPU fills the offer stage. Radius is % of the model bounds. */
const OFFER_MODEL_FEATURE_ORBIT = '16deg 72deg 68%';
const OFFER_MODEL_FEATURE_FOV = '16deg';
const OFFER_MODEL_FEATURE_SPIN = '8deg';
const OFFER_MODEL_THUMB_ORBIT = '18deg 74deg 88%';
const OFFER_MODEL_THUMB_FOV = '20deg';

let modelViewerScriptPromise: Promise<void> | null = null;

function loadModelViewer(): Promise<void> {
  if (modelViewerScriptPromise) return modelViewerScriptPromise;
  modelViewerScriptPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return resolve();
    if (customElements.get('model-viewer')) return resolve();
    const script = document.createElement('script');
    script.type = 'module';
    script.src = OFFER_MODEL_VIEWER_SCRIPT;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('model-viewer failed to load'));
    document.head.appendChild(script);
  });
  return modelViewerScriptPromise;
}

/** The MCX9 is the only offer miner with a .glb. Image miners keep using <img>. */
export function OfferMinerModel({
  src,
  alt,
  featured = false,
}: {
  src: string;
  alt: string;
  featured?: boolean;
}) {
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
          src,
          alt,
          'camera-controls': '',
          autoplay: '',
          'shadow-intensity': featured ? '0.85' : '0.4',
          exposure: featured ? '1.35' : '1.15',
          'tone-mapping': 'aces',
          'environment-image': 'neutral',
          'interaction-prompt': 'auto',
          'camera-orbit': featured ? OFFER_MODEL_FEATURE_ORBIT : OFFER_MODEL_THUMB_ORBIT,
          'field-of-view': featured ? OFFER_MODEL_FEATURE_FOV : OFFER_MODEL_THUMB_FOV,
        };
        if (featured) {
          attrs['auto-rotate'] = '';
          attrs['rotation-per-second'] = OFFER_MODEL_FEATURE_SPIN;
        }
        for (const [key, value] of Object.entries(attrs)) {
          viewer.setAttribute(key, value);
        }
        viewer.style.width = '100%';
        viewer.style.height = '100%';
        viewer.style.background = 'transparent';
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
  }, [src, alt, featured]);

  if (failed) return null;
  return <div ref={hostRef} className="h-full w-full" />;
}
