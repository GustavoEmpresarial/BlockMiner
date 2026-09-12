import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Clock, ExternalLink, X } from 'lucide-react';
import { getDashboardBanners, type DashboardBannerPayload } from '../lib/dashboard.api';
import { DASHBOARD_BANNER_AUTO_ADVANCE_MS } from '../lib/dashboard.config';
import { logDashboardError } from '../lib/dashboard.errors';

function isVideoMediaUrl(url: string): boolean {
  return /\.(mp4|webm|ogg|mov|avi)$/i.test(url);
}

function resolveBannerMediaUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^(https?:|data:|blob:)/i.test(trimmed) || trimmed.startsWith('/')) return trimmed;
  if (trimmed.startsWith('uploads/')) return `/${trimmed}`;
  return trimmed;
}

function formatBannerEndsIn(endsAt: string | null | undefined, nowMs: number): string | null {
  if (!endsAt) return null;
  const diffMs = new Date(endsAt).getTime() - nowMs;
  if (!(diffMs > 0)) return null;
  const days = Math.floor(diffMs / 86_400_000);
  const hours = Math.floor((diffMs % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diffMs % 3_600_000) / 60_000);
  const seconds = Math.floor((diffMs % 60_000) / 1000);
  if (days > 0) return `${days}d : ${hours}h : ${minutes}m`;
  if (hours > 0) return `${hours}h : ${minutes}m : ${seconds}s`;
  return `${minutes}m : ${seconds}s`;
}

function BannerSlide({
  banner,
  nowMs,
  onOpen,
}: {
  banner: DashboardBannerPayload;
  nowMs: number;
  onOpen: (banner: DashboardBannerPayload) => void;
}) {
  const endsIn = formatBannerEndsIn(banner.endsAt ?? null, nowMs);
  const mediaUrl = resolveBannerMediaUrl(banner.imageUrl ?? null);
  const [mediaFailed, setMediaFailed] = useState(false);
  const showMedia = Boolean(mediaUrl && !mediaFailed);

  return (
    <button
      type="button"
      onClick={() => onOpen(banner)}
      className="relative w-full h-full overflow-hidden rounded-2xl bg-slate-900 border border-white/[0.08] group cursor-pointer select-none text-left"
    >
      {showMedia ? (
        isVideoMediaUrl(mediaUrl!) ? (
          <video
            src={mediaUrl!}
            className="w-full h-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            onError={() => setMediaFailed(true)}
          />
        ) : (
          <img
            src={mediaUrl!}
            alt={banner.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            draggable={false}
            loading="lazy"
            onError={() => setMediaFailed(true)}
          />
        )
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
          <p className="text-sm font-bold text-slate-400 px-4 text-center">{banner.title}</p>
        </div>
      )}
      <div className="absolute inset-0 bg-black/10 group-hover:bg-black/25 transition-colors duration-300 rounded-2xl" />
      {endsIn ? (
        <div className="absolute top-0 left-0 right-0 flex justify-center">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-black/70 backdrop-blur-sm rounded-b-xl text-[11px] font-black text-white tracking-wider">
            <Clock className="w-3 h-3 text-amber-400" />
            <span className="text-amber-300">TERMINA EM</span>
            <span>{endsIn}</span>
          </div>
        </div>
      ) : null}
    </button>
  );
}

function BannerDetailModal({
  banner,
  nowMs,
  onClose,
}: {
  banner: DashboardBannerPayload;
  nowMs: number;
  onClose: () => void;
}) {
  const endsIn = formatBannerEndsIn(banner.endsAt ?? null, nowMs);
  const mediaUrl = resolveBannerMediaUrl(banner.imageUrl ?? null);
  const [mediaFailed, setMediaFailed] = useState(false);
  const showMedia = Boolean(mediaUrl && !mediaFailed);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-white/[0.08] bg-slate-900 shadow-2xl shadow-black/60 animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/60 text-white shadow-lg transition-colors hover:bg-black/80"
        >
          <X className="w-5 h-5" />
        </button>
        {showMedia ? (
          <div className="relative w-full aspect-video">
            {isVideoMediaUrl(mediaUrl!) ? (
              <video
                src={mediaUrl!}
                className="w-full h-full object-cover"
                autoPlay
                muted
                loop
                playsInline
                onError={() => setMediaFailed(true)}
              />
            ) : (
              <img
                src={mediaUrl!}
                alt={banner.title}
                className="w-full h-full object-cover"
                draggable={false}
                onError={() => setMediaFailed(true)}
              />
            )}
            {endsIn ? (
              <div className="absolute top-0 left-0 right-0 flex justify-center">
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-black/70 backdrop-blur-sm rounded-b-xl text-[11px] font-black text-white tracking-wider">
                  <Clock className="w-3 h-3 text-amber-400" />
                  <span className="text-amber-300">TERMINA EM</span>
                  <span>{endsIn}</span>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="p-8 sm:p-10 space-y-4">
          <h3 className="text-2xl sm:text-3xl font-black text-white leading-snug">{banner.title}</h3>
          {banner.message ? (
            <p className="text-base text-slate-400 leading-relaxed whitespace-pre-line">{banner.message}</p>
          ) : null}
          {!showMedia && endsIn ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/40 text-xs font-black text-amber-300 tracking-wider">
              <Clock className="w-3.5 h-3.5" />
              <span>{`TERMINA EM ${endsIn}`}</span>
            </div>
          ) : null}
          <div className="flex items-center gap-3 pt-3">
            {banner.link ? (
              <a
                href={banner.link}
                target={banner.link.startsWith('http') ? '_blank' : '_self'}
                rel="noopener noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-4 text-base font-black uppercase tracking-wider text-black transition-colors hover:bg-primary/90"
              >
                {banner.linkLabel || 'Saiba mais'}
                <ExternalLink className="w-5 h-5" />
              </a>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className={`inline-flex items-center justify-center rounded-2xl border border-white/15 px-5 py-4 text-base font-bold text-slate-300 transition-colors hover:bg-white/5 ${banner.link ? '' : 'flex-1'}`}
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function DashboardBannersCarousel() {
  const [banners, setBanners] = useState<DashboardBannerPayload[]>([]);
  const [index, setIndex] = useState(0);
  const [visibleCount, setVisibleCount] = useState(3);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [detail, setDetail] = useState<DashboardBannerPayload | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const autoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDashboardBanners()
      .then((res) => {
        if (!cancelled && res.ok && Array.isArray(res.banners)) setBanners(res.banners);
      })
      .catch((err: unknown) => {
        logDashboardError('DASHBOARD_BANNERS_FETCH_FAILED', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const host = trackRef.current?.parentElement;
    if (!host || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      if (w < 640) setVisibleCount(1);
      else if (w < 900) setVisibleCount(2);
      else if (w < 1200) setVisibleCount(3);
      else setVisibleCount(4);
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, [banners.length]);

  const maxIndex = Math.max(0, banners.length - visibleCount);
  useEffect(() => {
    setIndex((prev) => Math.min(prev, maxIndex));
  }, [maxIndex]);

  const step = useCallback(
    (delta: number) => {
      setIndex((prev) => {
        const next = prev + delta;
        if (next < 0) return maxIndex;
        if (next > maxIndex) return 0;
        return next;
      });
    },
    [maxIndex],
  );

  const restartAuto = useCallback(() => {
    if (autoTimerRef.current != null) clearInterval(autoTimerRef.current);
    autoTimerRef.current = setInterval(() => step(1), DASHBOARD_BANNER_AUTO_ADVANCE_MS);
  }, [step]);

  useEffect(() => {
    if (banners.length <= visibleCount) return;
    restartAuto();
    return () => {
      if (autoTimerRef.current != null) clearInterval(autoTimerRef.current);
    };
  }, [banners.length, visibleCount, restartAuto]);

  useEffect(() => {
    if (!banners.some((b) => b?.endsAt)) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [banners]);

  if (banners.length === 0) return null;

  const slideWidthPct = 100 / visibleCount;
  const dotCount = maxIndex + 1;

  return (
    <div className="relative w-full">
      <div className="overflow-hidden w-full" ref={trackRef}>
        <div
          className="flex transition-transform duration-500 ease-in-out"
          style={{ transform: `translateX(-${index * slideWidthPct}%)` }}
        >
          {banners.map((banner) => (
            <div key={String(banner.id)} className="shrink-0 px-1 sm:px-1.5" style={{ width: `${slideWidthPct}%` }}>
              <div className="w-full aspect-video">
                <BannerSlide banner={banner} nowMs={nowMs} onOpen={setDetail} />
              </div>
            </div>
          ))}
        </div>
      </div>
      {banners.length > visibleCount ? (
        <>
          <button
            type="button"
            onClick={() => {
              step(-1);
              restartAuto();
            }}
            className="absolute left-1 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/60 text-white shadow-lg transition-colors hover:bg-black/80 sm:left-0 sm:-translate-x-2"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              step(1);
              restartAuto();
            }}
            className="absolute right-1 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/60 text-white shadow-lg transition-colors hover:bg-black/80 sm:right-0 sm:translate-x-2"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </>
      ) : null}
      {dotCount > 1 ? (
        <div className="flex justify-center gap-1.5 mt-3">
          {Array.from({ length: dotCount }).map((_, dot) => (
            <button
              key={dot}
              type="button"
              onClick={() => {
                setIndex(dot);
                restartAuto();
              }}
              className={`rounded-full transition-all duration-300 ${dot === index ? 'w-5 h-2 bg-primary' : 'w-2 h-2 bg-white/20 hover:bg-white/40'}`}
            />
          ))}
        </div>
      ) : null}
      {detail ? <BannerDetailModal banner={detail} nowMs={nowMs} onClose={() => setDetail(null)} /> : null}
    </div>
  );
}
