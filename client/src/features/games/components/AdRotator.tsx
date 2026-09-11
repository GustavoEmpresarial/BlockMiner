import React, { useEffect, useRef, useState } from 'react';
import { mountMondiadBanner } from '../../../shared/utils/mondiad';

// ─── Types ──────────────────────────────────────────────────────────────────

export type AdProvider = 'zerads' | 'aads' | 'mondiad' | 'adsense';
export type AdSize = '728x90' | '468x60' | '300x250';

export interface AdConfig {
  provider: AdProvider;
  size: AdSize;
  src?: string;
  dataAa?: string;
  bannerId?: string;
  adClient?: string;
  adSlot?: string;
}

interface AdRotatorProps {
  ads: AdConfig[];
  size?: AdSize;
  slotId?: string;
  className?: string;
}

// ─── Size mapping ─────────────────────────────────────────────────────────

const SIZE_MAP: Record<AdSize, { width: number; height: number }> = {
  '728x90': { width: 728, height: 90 },
  '468x60': { width: 468, height: 60 },
  '300x250': { width: 300, height: 250 },
};

// ─── Ad renderers ─────────────────────────────────────────────────────────

function IframeAd({ ad, size }: { ad: AdConfig; size: AdSize }) {
  if (ad.provider === 'aads') {
    return (
      <div style={{ width: '100%', margin: 'auto', position: 'relative', zIndex: 10 }}>
        <iframe
          data-aa="2436936"
          src="//acceptable.a-ads.com/2436936/?size=Adaptive"
          style={{ border: 0, padding: 0, width: '70%', height: 'auto', overflow: 'hidden', display: 'block', margin: 'auto' }}
          title="AADS Ad"
        />
      </div>
    );
  }

  const { width, height } = SIZE_MAP[size];
  return (
    <div className="flex justify-center">
      <iframe
        src={ad.src}
        width={width}
        height={height}
        marginWidth={0}
        marginHeight={0}
        scrolling="no"
        frameBorder={0}
        style={{ border: 'none', maxWidth: '100%', display: 'block' }}
        title={`Ad ${ad.provider} ${size}`}
      />
    </div>
  );
}

function MondiadAd({ ad }: { ad: AdConfig }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mountMondiadBanner();
  }, [ad.bannerId]);

  return (
    <div
      ref={ref}
      data-mndbanid={ad.bannerId}
      className="flex justify-center"
    />
  );
}

function AdsenseAd({ ad, size }: { ad: AdConfig; size: AdSize }) {
  const { width, height } = SIZE_MAP[size];

  useEffect(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
    } catch {
      /* adsbygoogle not loaded yet — ad won't fill this cycle */
    }
  }, [ad.adSlot, ad.adClient]);

  return (
    <div className="flex justify-center">
      <ins
        className="adsbygoogle"
        style={{ display: 'inline-block', width, height, maxWidth: '100%' }}
        data-ad-client={ad.adClient}
        data-ad-slot={ad.adSlot}
      />
    </div>
  );
}

// ─── Rotation interval ─────────────────────────────────────────────────────

const ROTATION_INTERVAL_MS = 60_000;

// ─── Main component (memoized to prevent parent re-renders from blinking) ─

const AdRotator = React.memo(function AdRotator({ ads, size, className }: AdRotatorProps) {
  const [idx, setIdx] = useState<number>(() => (ads.length ? Math.floor(Math.random() * ads.length) : -1));

  useEffect(() => {
    if (ads.length <= 1) return;
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % ads.length);
    }, ROTATION_INTERVAL_MS);
    return () => clearInterval(id);
  }, [ads.length]);

  // Real bug found 12/08/2026 (PROGRESSO.txt item 66): the `mondiad` provider's div is handed
  // off to a 3rd-party script (banner.js) that mutates its DOM subtree directly, outside React's
  // knowledge (see mondiad.ts header). Rotating it OUT via the `idx` swap below — like every
  // other provider — makes React try to unmount/removeChild a node the ad script has since
  // touched, throwing `NotFoundError: Failed to execute 'removeChild' on 'Node'` and tripping
  // the root error boundary on every page that renders GLOBAL_LEADERBOARD_ADS. Fix: the mondiad
  // slot, once selected at least once, stays permanently mounted (toggled by CSS only) instead of
  // ever being unmounted again — iframe/adsense providers are unaffected and keep remounting on
  // rotation as before (AADS/ZerAds rely on the remount to fetch a fresh ad, per mondiad.ts).
  const mondiadEverSelectedRef = useRef(false);
  const mondiadAd = ads.find((a) => a.provider === 'mondiad');
  const isMondiadSelected = idx >= 0 && ads[idx]?.provider === 'mondiad';
  if (isMondiadSelected) mondiadEverSelectedRef.current = true;

  if (idx < 0 || !ads[idx]) return null;
  const selected = ads[idx];
  const adSize = size ?? selected.size;

  let content: React.ReactNode = null;
  if (!isMondiadSelected) {
    if (selected.provider === 'adsense') {
      content = <AdsenseAd ad={selected} size={adSize} />;
    } else {
      content = <IframeAd ad={selected} size={adSize} />;
    }
  }

  return (
    <div className={`flex flex-col items-center justify-center gap-1 my-8 w-full overflow-hidden ${className ?? ''}`}>
      {content}
      {mondiadAd && mondiadEverSelectedRef.current ? (
        <div style={{ display: isMondiadSelected ? undefined : 'none' }}>
          <MondiadAd ad={mondiadAd} />
        </div>
      ) : null}
      <span className="text-[9px] text-slate-600 uppercase tracking-widest font-mono">
        Sponsored
      </span>
    </div>
  );
});

export default AdRotator;

// ─── Presets ──────────────────────────────────────────────────────────────
// Ad slot configs are colocated with the component that renders them (AdConfig is defined
// right above); splitting these into a separate file for Fast Refresh has no runtime benefit.
/* eslint-disable react-refresh/only-export-components */

export const POWER_STATS_ADS: AdConfig[] = [
  { provider: 'zerads', size: '468x60', src: 'https://zerads.com/ad/ad.php?width=468&ref=10776' },
  { provider: 'aads', size: '468x60', dataAa: '2436936' },
];

export const POWER_STATS_ADS_300: AdConfig[] = [
  { provider: 'zerads', size: '300x250', src: 'https://zerads.com/ad/ad.php?width=300&ref=10776' },
  { provider: 'aads', size: '300x250', dataAa: '2436936' },
];

export const LEADERBOARD_ADS: AdConfig[] = [
  { provider: 'zerads', size: '728x90', src: 'https://zerads.com/ad/ad.php?width=728&ref=10776' },
  { provider: 'aads', size: '728x90', dataAa: '2436936' },
];

// ─── Global site-wide rotation pool ───────────────────────────────────────
// Rotates sequentially through every ad company every 60s (see ROTATION_INTERVAL_MS).
// Set ADSENSE_LEADERBOARD_SLOT to a real AdSense unit id to include Google in the rotation.

export const ADSENSE_AD_CLIENT = 'ca-pub-5721238025655493';
export const ADSENSE_LEADERBOARD_SLOT = '';

export const GLOBAL_LEADERBOARD_ADS: AdConfig[] = [
  { provider: 'zerads', size: '728x90', src: 'https://zerads.com/ad/ad.php?width=728&ref=10776' },
  { provider: 'aads', size: '728x90', dataAa: '2436936' },
  { provider: 'mondiad', size: '728x90', bannerId: '5674e300-8e33-44ee-ba4c-1f67f2934df2' },
  ...(ADSENSE_LEADERBOARD_SLOT
    ? [{ provider: 'adsense' as const, size: '728x90' as const, adClient: ADSENSE_AD_CLIENT, adSlot: ADSENSE_LEADERBOARD_SLOT }]
    : []),
];
