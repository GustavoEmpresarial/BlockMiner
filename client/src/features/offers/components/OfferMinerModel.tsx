import { useEffect, useRef, useState } from 'react';

const OFFER_MODEL_VIEWER_SCRIPT =
  'https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js';

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
export function OfferMinerModel({ src, alt }: { src: string; alt: string }) {
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
          'shadow-intensity': '0.4',
          exposure: '1.1',
          'tone-mapping': 'aces',
          'environment-image': 'neutral',
          'interaction-prompt': 'auto',
          'camera-orbit': '20deg 78deg 120%',
          'field-of-view': '26deg',
        };
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
  }, [src, alt]);

  if (failed) return null;
  return <div ref={hostRef} className="h-full w-full" />;
}
