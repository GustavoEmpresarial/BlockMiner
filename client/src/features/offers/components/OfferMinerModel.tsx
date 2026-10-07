import { useEffect, useRef, useState, type ReactNode } from 'react';

const OFFER_MODEL_VIEWER_SCRIPT =
  'https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js';

/** Closer than the default frame so the GPU fills the offer stage. Radius is % of the model bounds. */
export const OFFER_MODEL_FEATURE_ORBIT = '16deg 72deg 68%';
export const OFFER_MODEL_FEATURE_FOV = '16deg';
const OFFER_MODEL_FEATURE_SPIN = '8deg';
export const OFFER_MODEL_THUMB_ORBIT = '18deg 74deg 88%';
export const OFFER_MODEL_THUMB_FOV = '20deg';
/**
 * Percent radius is a fraction of idealCameraDistance, boundingSphere.radius / sin(fov/2).
 * Auto-rotate yaws only. At phi 75 the end-on view is the tall projection, so framing
 * the sphere (105%) or even the tight phi-75 fit (71%) leaves the face small in the wide bay.
 * Phi 90 keeps the camera on the horizon. A 24-angle pixel sweep of MinerCore MCX9
 * at the real bay boxes (651×188 and 248×66) clips below 54.5% and fits at 54.5%.
 * Desktop alone could use 52.9%; that is about 3% of the card, so both bays share 54.5%.
 * Offer featured and thumb keep their own orbits.
 */
export const RACK_MODEL_ORBIT = '12deg 90deg 54.5%';
export const RACK_MODEL_FOV = '16deg';

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
  variant,
  fallback = null,
}: {
  src: string;
  alt: string;
  featured?: boolean;
  /** Rack slot: spinning model, no camera drag, so the slot click still works. */
  variant?: 'featured' | 'thumb' | 'rack';
  fallback?: ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const mode = variant ?? (featured ? 'featured' : 'thumb');

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
          autoplay: '',
          'shadow-intensity': mode === 'thumb' ? '0.4' : '0.85',
          exposure: mode === 'thumb' ? '1.15' : '1.4',
          'tone-mapping': 'aces',
          'environment-image': 'neutral',
          'interaction-prompt': mode === 'rack' ? 'none' : 'auto',
          'camera-orbit': mode === 'featured' ? OFFER_MODEL_FEATURE_ORBIT : mode === 'rack' ? RACK_MODEL_ORBIT : OFFER_MODEL_THUMB_ORBIT,
          'field-of-view': mode === 'featured' ? OFFER_MODEL_FEATURE_FOV : mode === 'rack' ? RACK_MODEL_FOV : OFFER_MODEL_THUMB_FOV,
        };
        if (mode !== 'rack') attrs['camera-controls'] = '';
        if (mode === 'featured' || mode === 'rack') {
          attrs['auto-rotate'] = '';
          attrs['rotation-per-second'] = mode === 'rack' ? '20deg' : OFFER_MODEL_FEATURE_SPIN;
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
  }, [src, alt, mode]);

  if (failed) return <>{fallback}</>;
  return <div ref={hostRef} className="h-full w-full" />;
}
