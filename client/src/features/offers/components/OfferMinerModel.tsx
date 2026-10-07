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
 * model-viewer turns a percent radius into a fraction of idealCameraDistance,
 * which is boundingSphere.radius / sin(fov/2). 100% fits that sphere in the
 * framed field of view, so every yaw stays inside it. 105% is the library's
 * own margin (its default orbit). The offer stage keeps a closer orbit on purpose.
 */
export const RACK_MODEL_ORBIT = '12deg 75deg 105%';
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
