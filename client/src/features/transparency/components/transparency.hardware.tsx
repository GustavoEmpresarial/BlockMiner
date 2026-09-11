import { useCallback, useEffect, useRef, useState } from 'react';
import { Cpu, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TransparencyHardwareAsset } from './transparency.base';
import { formatSatoshi } from './transparency.base';

const MODEL_VIEWER_SCRIPT =
  'https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js';
let modelViewerScriptPromise: Promise<void> | null = null;

function loadModelViewer(): Promise<void> {
  if (modelViewerScriptPromise) return modelViewerScriptPromise;
  modelViewerScriptPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return resolve();
    if (customElements.get('model-viewer')) return resolve();
    const s = document.createElement('script');
    s.type = 'module';
    s.src = MODEL_VIEWER_SCRIPT;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Falha ao carregar model-viewer.'));
    document.head.appendChild(s);
  });
  return modelViewerScriptPromise;
}

function applyAntminerMaterialFix(mv: HTMLElement): void {
  type TexSlot = { setTexture?: (tex: unknown) => void };
  type Pbr = {
    setBaseColorFactor?: (factor: [number, number, number, number]) => void;
    setMetallicFactor?: (factor: number) => void;
    setRoughnessFactor?: (factor: number) => void;
    baseColorTexture?: TexSlot;
  };
  type Mat = { name?: string; pbrMetallicRoughness?: Pbr };

  const model = (mv as HTMLElement & { model?: { materials?: Mat[] } }).model;
  const materials = model?.materials;
  if (!Array.isArray(materials)) return;

  for (const mat of materials) {
    const pbr = mat.pbrMetallicRoughness;
    if (!pbr) continue;
    const name = String(mat.name || '');

    if (name === 'Antminer_Metal' || name === 'Metal') {
      pbr.baseColorTexture?.setTexture?.(null);
      pbr.setBaseColorFactor?.([0.14, 0.15, 0.17, 1]);
      pbr.setMetallicFactor?.(0.9);
      pbr.setRoughnessFactor?.(0.36);
    } else if (name === 'Dark' || name === 'Black_Fan') {
      pbr.baseColorTexture?.setTexture?.(null);
      pbr.setBaseColorFactor?.([0.05, 0.05, 0.06, 1]);
      pbr.setMetallicFactor?.(0.5);
      pbr.setRoughnessFactor?.(0.55);
    } else if (name === 'Lights') {
      pbr.baseColorTexture?.setTexture?.(null);
      pbr.setBaseColorFactor?.([0.55, 0.12, 0.08, 1]);
      pbr.setMetallicFactor?.(0.15);
      pbr.setRoughnessFactor?.(0.35);
    }
  }
}

export function AntminerModelViewer({ src, onError }: { src: string; onError: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const mv = document.createElement('model-viewer');
    const attrs: Record<string, string> = {
      src,
      alt: 'Hardware 3D model',
      'camera-controls': '',
      'auto-rotate': '',
      'rotation-per-second': '18deg',
      'shadow-intensity': '1',
      'shadow-softness': '1',
      exposure: '0.7',
      'tone-mapping': 'aces',
      'environment-image': 'neutral',
      'interaction-prompt': 'none',
      loading: 'eager',
      reveal: 'auto',
      'camera-orbit': '35deg 70deg 105%',
      'field-of-view': '28deg',
    };
    for (const [key, value] of Object.entries(attrs)) {
      mv.setAttribute(key, value);
    }
    mv.style.width = '100%';
    mv.style.height = '100%';
    mv.style.background = 'linear-gradient(180deg, #0b1220 0%, #050913 100%)';
    mv.style.setProperty('--poster-color', 'transparent');

    const handleError = () => onError();
    const handleLoad = () => applyAntminerMaterialFix(mv);

    mv.addEventListener('error', handleError);
    mv.addEventListener('load', handleLoad);
    host.appendChild(mv);

    return () => {
      mv.removeEventListener('error', handleError);
      mv.removeEventListener('load', handleLoad);
      mv.remove();
    };
  }, [src, onError]);

  return <div ref={hostRef} className="w-full h-full" data-testid="hardware-model-viewer" />;
}

function HardwareAssetCard({ asset }: { asset: TransparencyHardwareAsset }) {
  const { t } = useTranslation();
  const [loadingScript, setLoadingScript] = useState(Boolean(asset.model3dUrl));
  const [scriptReady, setScriptReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showViewer = Boolean(asset.model3dUrl);

  useEffect(() => {
    if (!showViewer) {
      setLoadingScript(false);
      return;
    }
    let cancelled = false;
    loadModelViewer()
      .then(() => { if (!cancelled) setScriptReady(true); })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t('transparency.hardware.viewer_error'));
      })
      .finally(() => { if (!cancelled) setLoadingScript(false); });
    return () => { cancelled = true; };
  }, [showViewer, t]);

  const handleViewerError = useCallback(() => {
    setError(t('transparency.hardware.viewer_error'));
  }, [t]);

  const cost = Number(asset.purchaseCostUsd);
  const statusLabel = asset.statusLabel || t(`transparency.hardware.status_${asset.status}`, asset.status);
  const specs = Array.isArray(asset.specs) ? asset.specs : [];
  const summary = asset.profitSummary;
  const profitLogs = asset.profitLogs ?? [];
  const recoveredPct = summary?.recoveredPct ?? 0;
  const progressPct = Math.min(100, Math.max(0, recoveredPct));

  const fmtUsd = (value: number | null | undefined) => {
    if (value == null || !Number.isFinite(value)) return '—';
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return iso;
    }
  };

  return (
    <section
      className="rounded-3xl border border-white/8 bg-gradient-to-br from-slate-900 via-slate-900 to-amber-500/[0.04] overflow-hidden"
      data-testid="hardware-asset-card"
    >
      <header className="px-6 py-5 border-b border-white/5 flex items-center gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
          <Cpu className="w-4 h-4 text-amber-400" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-black text-white uppercase tracking-widest">{t('transparency.hardware.section_title')}</h2>
          <p className="text-[11px] text-gray-500 mt-0.5">{t('transparency.hardware.section_subtitle')}</p>
        </div>
        {asset.status === 'running' && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {statusLabel}
          </span>
        )}
      </header>

      <div className={`grid gap-6 p-6 ${showViewer ? 'md:grid-cols-[1fr_auto]' : ''}`}>
        <div className="space-y-4">
          <div>
            {asset.manufacturer && (
              <p className="text-[10px] uppercase tracking-widest text-amber-400/80 font-mono mb-1">{asset.manufacturer}</p>
            )}
            <h3 className="text-2xl font-black text-white tracking-tight">{asset.name}</h3>
            {asset.description && (
              <p className="text-xs text-gray-400 mt-2 max-w-md leading-relaxed">{asset.description}</p>
            )}
          </div>

          {(asset.purchaseNote || Number.isFinite(cost)) && (
            <div className="rounded-xl border border-amber-500/15 bg-amber-500/[0.04] p-4 space-y-3">
              <p className="text-[10px] uppercase tracking-widest text-amber-400 font-mono">
                {t('transparency.hardware.purchase_title')}
              </p>
              {asset.purchaseNote && (
                <p className="text-xs text-gray-300 leading-relaxed">{asset.purchaseNote}</p>
              )}
              <div className="grid grid-cols-2 gap-3 pt-1">
                {Number.isFinite(cost) && (
                  <div className="rounded-lg bg-slate-900/60 border border-white/5 px-3 py-2">
                    <p className="text-[9px] uppercase tracking-widest text-gray-500 font-mono">{t('transparency.hardware.cost_label')}</p>
                    <p className="mt-0.5 text-lg font-black text-amber-300 font-mono">${cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </div>
                )}
                {asset.transitWeeks != null && asset.transitWeeks > 0 && (
                  <div className="rounded-lg bg-slate-900/60 border border-white/5 px-3 py-2">
                    <p className="text-[9px] uppercase tracking-widest text-gray-500 font-mono">{t('transparency.hardware.transit_label')}</p>
                    <p className="mt-0.5 text-lg font-black text-white font-mono">{t('transparency.hardware.weeks', { count: asset.transitWeeks })}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {specs.length > 0 && (
            <dl className="grid grid-cols-2 gap-3 text-xs">
              {specs.map((row) => (
                <div key={`${row.label}-${row.value}`} className="rounded-xl border border-white/8 bg-slate-900/50 px-3 py-2">
                  <dt className="text-[10px] uppercase tracking-widest text-gray-500 font-mono">{row.label}</dt>
                  <dd className="mt-0.5 text-sm font-black text-white">{row.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {summary && Number.isFinite(cost) && cost > 0 && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 space-y-4" data-testid="hardware-roi-section">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                <p className="text-[10px] uppercase tracking-widest text-emerald-400 font-mono">
                  {t('transparency.hardware.profit_title')}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-900/60 border border-white/5 px-3 py-2">
                  <p className="text-[9px] uppercase tracking-widest text-gray-500 font-mono">{t('transparency.hardware.profit_total')}</p>
                  <p className="mt-0.5 text-lg font-black text-amber-300 font-mono">
                    {formatSatoshi(summary.totalEarnedSatoshi ?? '0')} <span className="text-xs text-amber-400/80">sats</span>
                  </p>
                  <p className="text-sm font-black text-emerald-300 font-mono">{fmtUsd(summary.totalEarnedUsd)}</p>
                </div>
                <div className="rounded-lg bg-slate-900/60 border border-white/5 px-3 py-2">
                  <p className="text-[9px] uppercase tracking-widest text-gray-500 font-mono">{t('transparency.hardware.profit_recovered')}</p>
                  <p className="mt-0.5 text-lg font-black text-white font-mono">{recoveredPct.toFixed(1)}%</p>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[10px] text-gray-500 mb-1.5">
                  <span>{t('transparency.hardware.profit_progress')}</span>
                  <span>{fmtUsd(summary.totalEarnedUsd)} / {fmtUsd(cost)}</span>
                </div>
                <div className="h-2 rounded-full bg-black/30 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${summary.roiReached ? 'bg-emerald-400' : 'bg-emerald-500/70'}`}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                {summary.roiReached ? (
                  <p className="mt-2 text-[11px] text-emerald-400 font-bold">{t('transparency.hardware.roi_reached')}</p>
                ) : summary.estimatedDaysToRoi != null && summary.avgDailyUsd != null ? (
                  <p className="mt-2 text-[11px] text-gray-500">
                    {t('transparency.hardware.roi_estimate', {
                      days: summary.estimatedDaysToRoi,
                      daily: summary.avgDailyUsd.toFixed(2),
                    })}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-widest text-gray-500 font-mono">
                  {t('transparency.hardware.profit_history_title')}
                </p>
                <div className="overflow-x-auto rounded-xl border border-white/8">
                  <table className="w-full text-left text-[11px]" data-testid="hardware-profit-history">
                    <thead>
                      <tr className="border-b border-white/8 bg-black/20 text-[9px] uppercase tracking-widest text-gray-500">
                        <th className="px-3 py-2 font-mono">{t('transparency.hardware.profit_date')}</th>
                        <th className="px-3 py-2 font-mono">{t('transparency.hardware.profit_sats')}</th>
                        <th className="px-3 py-2 font-mono">{t('transparency.hardware.profit_usd')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profitLogs.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-3 py-4 text-center text-gray-600">
                            {t('transparency.hardware.profit_history_empty')}
                          </td>
                        </tr>
                      ) : (
                        profitLogs.map((log) => (
                          <tr key={log.id} className="border-b border-white/5 last:border-0">
                            <td className="px-3 py-2 text-gray-300 whitespace-nowrap">{fmtDate(log.earnedAt)}</td>
                            <td className="px-3 py-2 text-amber-300 font-mono font-bold">
                              {formatSatoshi(log.satoshiAmount)} sats
                            </td>
                            <td className="px-3 py-2 text-emerald-300 font-mono font-bold">{fmtUsd(log.earnedUsd)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {summary.logCount === 0 && (
                  <p className="text-[11px] text-gray-600">{t('transparency.hardware.profit_empty')}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {showViewer && asset.model3dUrl && (
          <div className="md:w-[280px] space-y-3">
            <div className="relative aspect-square rounded-2xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-hidden">
              {loadingScript && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10 bg-slate-950/80">
                  <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-[10px] text-gray-500 font-mono uppercase tracking-widest">{t('transparency.hardware.viewer_loading')}</p>
                </div>
              )}
              {error && (
                <div className="absolute inset-0 flex items-center justify-center p-4 text-center z-10 bg-slate-950/80">
                  <p className="text-xs text-red-400">{error}</p>
                </div>
              )}
              {scriptReady && !error && (
                <AntminerModelViewer src={asset.model3dUrl} onError={handleViewerError} />
              )}
            </div>
            {scriptReady && !error && (
              <p className="text-[10px] text-gray-600 text-center font-mono">
                {t('transparency.hardware.viewer_hint')}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export function HardwareSection() {
  const [assets, setAssets] = useState<TransparencyHardwareAsset[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/transparency/hardware-assets')
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && json.ok) setAssets(json.assets ?? []);
      })
      .catch(() => {
        if (!cancelled) setAssets([]);
      });
    return () => { cancelled = true; };
  }, []);

  if (assets === null) {
    return <div className="rounded-3xl border border-white/8 bg-white/2 h-64 animate-pulse" data-testid="hardware-loading" />;
  }

  if (assets.length === 0) return null;

  return (
    <div className="space-y-6">
      {assets.map((asset) => (
        <HardwareAssetCard key={asset.id} asset={asset} />
      ))}
    </div>
  );
}
