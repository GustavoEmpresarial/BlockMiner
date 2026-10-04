import { useState, useRef, useEffect } from 'react';
import { Sparkles, RotateCcw, ExternalLink, Box, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface SubscriptionModelItem {
  id: string;
  name: string;
  provider: string;
  providerUrl: string;
  category: string;
  monthlyCostUsd: number;
  monthlyCostOriginal?: string;
  description: string;
  model3dUrl: string;
  imageUrl: string;
  accentColor: string;
  glowColor: string;
  tags: string[];
}

export const SUBSCRIPTION_MODELS: SubscriptionModelItem[] = [
  {
    id: 'claude',
    name: 'Claude Code (Clawd)',
    provider: 'Anthropic',
    providerUrl: 'https://anthropic.com/claude',
    category: 'Ferramentas de IA',
    monthlyCostUsd: 20.0,
    description:
      'Clawd — O mascote oficial do Claude Code pela Anthropic em 3D. IA utilizada no desenvolvimento, testes de segurança e arquitetura do BlockMiner.',
    model3dUrl: '/media/transparency/claude-mascot.glb',
    imageUrl: '/media/transparency/claude-mascot.png',
    accentColor: '#F25F22',
    glowColor: 'rgba(242, 95, 34, 0.25)',
    tags: ['Mascote Clawd 3D', 'Claude 3.7 Sonnet', 'Anthropic PBC'],
  },
  {
    id: 'gemini',
    name: 'Gemini Pro',
    provider: 'Google Cloud',
    providerUrl: 'https://gemini.google.com',
    category: 'Ferramentas de IA',
    monthlyCostUsd: 4.65,
    monthlyCostOriginal: 'R$ 24,00',
    description:
      'IA multimodal da Google aplicada em suporte de raciocínio, prototipagem, automação e design de assets da plataforma.',
    model3dUrl: '/media/transparency/gemini.glb',
    imageUrl: '/media/transparency/gemini.png',
    accentColor: '#4E82EE',
    glowColor: 'rgba(78, 130, 238, 0.25)',
    tags: ['Gemini 1.5 Pro', 'Google LLC', 'IA Multimodal'],
  },
  {
    id: 'contabo',
    name: 'Servidor Cloud VPS',
    provider: 'Contabo GmbH',
    providerUrl: 'https://contabo.com',
    category: 'Infraestrutura',
    monthlyCostUsd: 9.0,
    description:
      'Instância de servidor em nuvem com alta capacidade dedicada à execução do backend em Node.js, containers Docker, banco PostgreSQL e Redis.',
    model3dUrl: '/media/transparency/contabo.glb',
    imageUrl: '/media/transparency/contabo.png',
    accentColor: '#0084FF',
    glowColor: 'rgba(0, 132, 255, 0.25)',
    tags: ['Cloud VPS Hosting', 'Datacenter Contabo', 'Uptime 99.9%'],
  },
];

const MODEL_VIEWER_SCRIPT =
  'https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js';
let modelViewerPromise: Promise<void> | null = null;

function ensureModelViewer(): Promise<void> {
  if (modelViewerPromise) return modelViewerPromise;
  modelViewerPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return resolve();
    if (customElements.get('model-viewer')) return resolve();
    const script = document.createElement('script');
    script.type = 'module';
    script.src = MODEL_VIEWER_SCRIPT;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Falha ao carregar Google model-viewer'));
    document.head.appendChild(script);
  });
  return modelViewerPromise;
}

function applyMascotMaterialFix(mv: HTMLElement): void {
  type TexSlot = { setTexture?: (tex: unknown) => void };
  type Pbr = {
    setBaseColorFactor?: (factor: [number, number, number, number]) => void;
    setMetallicFactor?: (factor: number) => void;
    setRoughnessFactor?: (factor: number) => void;
    baseColorTexture?: TexSlot;
  };
  type Mat = {
    name?: string;
    pbrMetallicRoughness?: Pbr;
    setEmissiveFactor?: (factor: [number, number, number]) => void;
  };

  const model = (mv as HTMLElement & { model?: { materials?: Mat[] } }).model;
  const materials = model?.materials;
  if (!Array.isArray(materials)) return;

  for (const mat of materials) {
    const name = String(mat.name || '');
    if (name === 'ClawdBody') {
      const pbr = mat.pbrMetallicRoughness;
      if (pbr) {
        // Vibrant vivid cartoon warm orange
        pbr.setBaseColorFactor?.([1.0, 0.32, 0.05, 1.0]);
        pbr.setRoughnessFactor?.(0.22);
        pbr.setMetallicFactor?.(0.0);
      }
      mat.setEmissiveFactor?.([0.38, 0.08, 0.01]);
    } else if (name === 'ClawdEyes') {
      const pbr = mat.pbrMetallicRoughness;
      if (pbr) {
        pbr.setBaseColorFactor?.([0.02, 0.02, 0.025, 1.0]);
        pbr.setRoughnessFactor?.(0.08);
      }
    }
  }
}

export function Generic3DViewer({ src, fallbackImg, alt }: { src: string; fallbackImg: string; alt: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
    const container = containerRef.current;
    if (!container) return;

    const mv = document.createElement('model-viewer');
    mv.setAttribute('src', src);
    mv.setAttribute('alt', alt);
    mv.setAttribute('camera-controls', '');
    mv.setAttribute('auto-rotate', '');
    mv.setAttribute('rotation-per-second', '24deg');
    mv.setAttribute('shadow-intensity', '1.0');
    mv.setAttribute('shadow-softness', '0.5');
    mv.setAttribute('exposure', '1.1');
    mv.setAttribute('environment-image', 'neutral');
    mv.setAttribute('interaction-prompt', 'none');
    mv.setAttribute('loading', 'eager');
    mv.setAttribute('reveal', 'auto');
    mv.setAttribute('camera-orbit', '30deg 75deg 105%');
    mv.setAttribute('field-of-view', '28deg');

    mv.style.width = '100%';
    mv.style.height = '100%';
    mv.style.background = 'radial-gradient(circle at center, #111a2e 0%, #060b17 100%)';
    mv.style.setProperty('--poster-color', 'transparent');

    const onError = () => setHasError(true);
    const onLoad = () => applyMascotMaterialFix(mv);

    mv.addEventListener('error', onError);
    mv.addEventListener('load', onLoad);
    container.innerHTML = '';
    container.appendChild(mv);

    return () => {
      mv.removeEventListener('error', onError);
      mv.removeEventListener('load', onLoad);
      mv.remove();
    };
  }, [src, alt]);

  if (hasError) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950/70 p-4 text-center">
        <img src={fallbackImg} alt={alt} className="w-28 h-28 object-contain drop-shadow-xl mb-2" />
        <span className="text-[11px] text-slate-400 font-bold">{alt}</span>
      </div>
    );
  }

  return <div ref={containerRef} className="w-full h-full" />;
}

export function AiInfrastructure3DSection() {
  const [selectedId, setSelectedId] = useState<string>('claude');
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    let active = true;
    ensureModelViewer()
      .then(() => {
        if (active) setScriptReady(true);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const activeItem = SUBSCRIPTION_MODELS.find((m) => m.id === selectedId) || SUBSCRIPTION_MODELS[0];

  return (
    <section
      data-testid="ai-infrastructure-3d-section"
      className="rounded-2xl border border-white/10 bg-slate-900/90 overflow-hidden shadow-xl"
    >
      {/* ── Compact Header ─────────────────────────────────────────────── */}
      <header className="px-5 py-3 border-b border-white/10 flex flex-wrap items-center justify-between gap-3 bg-slate-950/60">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/25 flex items-center justify-center shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
          </div>
          <div>
            <h2 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
              Modelos 3D de IA & Infraestrutura
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-black text-primary uppercase border border-primary/25">
                .GLB Interativo
              </span>
            </h2>
          </div>
        </div>

        {/* Model Selector Pills */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950/80 border border-white/10">
          {SUBSCRIPTION_MODELS.map((item) => {
            const isSelected = item.id === selectedId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  isSelected
                    ? 'bg-primary text-slate-950 shadow-sm shadow-primary/20'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <img src={item.imageUrl} alt="" className="w-3.5 h-3.5 rounded-full object-contain shrink-0" />
                <span>{item.name}</span>
                <span className={`text-[10px] ${isSelected ? 'text-slate-950 font-black' : 'text-slate-500'}`}>
                  ${item.monthlyCostUsd.toFixed(2)}
                </span>
              </button>
            );
          })}
        </div>
      </header>

      {/* ── Main Content: Info on LEFT, .GLB 3D on RIGHT ───────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-12 min-h-[250px] md:h-[270px]">
        {/* Left Side: Clean, Concise Information */}
        <div className="md:col-span-6 p-5 flex flex-col justify-between border-b md:border-b-0 md:border-r border-white/10 space-y-3">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-primary">
                {activeItem.category}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Assinatura Ativa
              </span>
            </div>

            <div className="flex items-baseline justify-between gap-3 mt-1.5">
              <div>
                <h3 className="text-lg font-black text-white leading-tight">
                  {activeItem.name}
                </h3>
                <a
                  href={activeItem.providerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-slate-400 hover:text-primary transition inline-flex items-center gap-1 mt-0.5 font-semibold"
                >
                  {activeItem.provider}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div className="text-right shrink-0">
                <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold block">Assinatura Mensal</span>
                <p className="text-xl font-black text-emerald-400 leading-tight">
                  ${activeItem.monthlyCostUsd.toFixed(2)}
                  <span className="text-xs text-slate-500 font-bold ml-1">/mês</span>
                </p>
                {activeItem.monthlyCostOriginal && (
                  <span className="text-[10px] text-slate-500 block font-medium">({activeItem.monthlyCostOriginal})</span>
                )}
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed mt-2.5 line-clamp-3">
              {activeItem.description}
            </p>
          </div>

          {/* Quick Tags & Audit Verification */}
          <div className="pt-2 border-t border-white/5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {activeItem.tags.map((tag, idx) => (
                <span
                  key={idx}
                  className="text-[10px] font-semibold bg-white/5 text-slate-300 px-2 py-0.5 rounded-md border border-white/5"
                >
                  {tag}
                </span>
              ))}
            </div>

            <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400 ml-auto">
              <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
              Auditado no balanço
            </span>
          </div>
        </div>

        {/* Right Side: .GLB 3D Viewer */}
        <div className="md:col-span-6 relative h-[240px] md:h-full bg-slate-950/60 overflow-hidden flex items-center justify-center">
          {scriptReady ? (
            <Generic3DViewer
              src={activeItem.model3dUrl}
              fallbackImg={activeItem.imageUrl}
              alt={activeItem.name}
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-2">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-[11px] font-bold text-slate-400">Carregando 3D...</span>
            </div>
          )}

          {/* Bottom Controls Bar */}
          <div className="absolute bottom-2 inset-x-3 flex items-center justify-between pointer-events-none text-[9px] font-bold text-slate-400 bg-slate-950/80 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10">
            <span className="flex items-center gap-1">
              <RotateCcw className="w-3 h-3 text-primary" />
              Arraste para girar em 3D · scroll para zoom
            </span>
            <a
              href={activeItem.model3dUrl}
              download
              className="pointer-events-auto text-primary hover:underline flex items-center gap-1"
            >
              <Box className="w-2.5 h-2.5" />
              Download .glb
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
