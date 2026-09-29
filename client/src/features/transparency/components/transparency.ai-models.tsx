import { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, Sparkles, Server, RotateCcw, ExternalLink, Box, CheckCircle2, DollarSign } from 'lucide-react';
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
  specs: Array<{ label: string; value: string }>;
}

export const SUBSCRIPTION_MODELS: SubscriptionModelItem[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    provider: 'Anthropic',
    providerUrl: 'https://anthropic.com/claude',
    category: 'Ferramentas & Programação',
    monthlyCostUsd: 20.0,
    description:
      'Inteligência Artificial de ponta utilizada na engenharia de software, refatoração de código, testes de segurança automatizados e arquitetura do BlockMiner.',
    model3dUrl: '/media/transparency/claude.glb',
    imageUrl: '/media/transparency/claude.png',
    accentColor: '#D97757',
    glowColor: 'rgba(217, 119, 87, 0.25)',
    specs: [
      { label: 'Modelo de IA', value: 'Claude 3.7 Sonnet / Opus' },
      { label: 'Aplicação', value: 'Engenharia de Software & QA' },
      { label: 'Empresa', value: 'Anthropic PBC' },
      { label: 'Formato 3D', value: 'glTF 2.0 Binary (.glb)' },
      { label: 'Período', value: 'Assinatura Mensal' },
    ],
  },
  {
    id: 'gemini',
    name: 'Gemini Pro',
    provider: 'Google Cloud',
    providerUrl: 'https://gemini.google.com',
    category: 'Ferramentas & IA Multimodal',
    monthlyCostUsd: 4.65,
    monthlyCostOriginal: 'R$ 24,00',
    description:
      'Modelo de inteligência artificial multimodal empregado no processamento de linguagem natural, prototipagem, design de assets e testes lógicos.',
    model3dUrl: '/media/transparency/gemini.glb',
    imageUrl: '/media/transparency/gemini.png',
    accentColor: '#4E82EE',
    glowColor: 'rgba(78, 130, 238, 0.25)',
    specs: [
      { label: 'Modelo de IA', value: 'Gemini 1.5 Pro / Ultra' },
      { label: 'Aplicação', value: 'Multimodal & Raciocínio' },
      { label: 'Empresa', value: 'Google LLC' },
      { label: 'Formato 3D', value: 'glTF 2.0 Binary (.glb)' },
      { label: 'Período', value: 'Assinatura Mensal (PTAX)' },
    ],
  },
  {
    id: 'contabo',
    name: 'Servidor Cloud VPS',
    provider: 'Contabo GmbH',
    providerUrl: 'https://contabo.com',
    category: 'Infraestrutura & Hosting',
    monthlyCostUsd: 9.0,
    description:
      'Instância de servidor em nuvem com alta capacidade dedicada à execução do backend em Node.js, containers Docker, banco PostgreSQL e Redis.',
    model3dUrl: '/media/transparency/contabo.glb',
    imageUrl: '/media/transparency/contabo.png',
    accentColor: '#0084FF',
    glowColor: 'rgba(0, 132, 255, 0.25)',
    specs: [
      { label: 'Recurso', value: 'Cloud VPS High-Performance' },
      { label: 'Aplicação', value: 'Node.js, Docker, PostgreSQL' },
      { label: 'Datacenter', value: 'Contabo Alemanha / EUA' },
      { label: 'Formato 3D', value: 'glTF 2.0 Binary (.glb)' },
      { label: 'Uptime', value: '99.9% Operacional' },
    ],
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
    mv.setAttribute('rotation-per-second', '25deg');
    mv.setAttribute('shadow-intensity', '1.2');
    mv.setAttribute('shadow-softness', '0.8');
    mv.setAttribute('exposure', '1.0');
    mv.setAttribute('environment-image', 'neutral');
    mv.setAttribute('interaction-prompt', 'none');
    mv.setAttribute('loading', 'eager');
    mv.setAttribute('reveal', 'auto');
    mv.setAttribute('camera-orbit', '35deg 75deg 105%');
    mv.setAttribute('field-of-view', '32deg');

    mv.style.width = '100%';
    mv.style.height = '100%';
    mv.style.background = 'radial-gradient(circle at center, #10192d 0%, #060b17 100%)';
    mv.style.setProperty('--poster-color', 'transparent');

    const onError = () => setHasError(true);
    mv.addEventListener('error', onError);
    container.innerHTML = '';
    container.appendChild(mv);

    return () => {
      mv.removeEventListener('error', onError);
      mv.remove();
    };
  }, [src, alt]);

  if (hasError) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950/70 p-6 text-center">
        <img src={fallbackImg} alt={alt} className="w-40 h-40 object-contain drop-shadow-2xl mb-3" />
        <span className="text-xs text-slate-400 font-bold">{alt}</span>
      </div>
    );
  }

  return <div ref={containerRef} className="w-full h-full" />;
}

export function AiInfrastructure3DSection() {
  const { t } = useTranslation();
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
      className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900/90 to-primary/5 overflow-hidden shadow-2xl relative"
    >
      {/* ── Top Header ─────────────────────────────────────────────────── */}
      <header className="px-6 py-5 border-b border-white/10 flex flex-wrap items-center justify-between gap-4 bg-slate-950/50 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/25 flex items-center justify-center shadow-lg shadow-primary/10">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              Modelos 3D de Inteligência Artificial & Infraestrutura
              <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[9px] font-black text-primary uppercase border border-primary/30">
                Interativo .GLB
              </span>
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Assinaturas operacionais modeladas e renderizadas em 3D procedural para transparência total da plataforma.
            </p>
          </div>
        </div>

        {/* Model Selector Pills */}
        <div className="flex items-center gap-2 overflow-x-auto p-1 rounded-2xl bg-slate-950/80 border border-white/10">
          {SUBSCRIPTION_MODELS.map((item) => {
            const isSelected = item.id === selectedId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  isSelected
                    ? 'bg-primary text-slate-950 shadow-md shadow-primary/20'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <img src={item.imageUrl} alt="" className="w-4 h-4 rounded-full object-contain shrink-0" />
                <span>{item.name}</span>
                <span className={`text-[10px] ${isSelected ? 'text-slate-950 font-black' : 'text-slate-500'}`}>
                  ${item.monthlyCostUsd.toFixed(2)}
                </span>
              </button>
            );
          })}
        </div>
      </header>

      {/* ── Main 3D Display & Specifications ───────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[420px]">
        {/* 3D Model Viewer Stage */}
        <div className="lg:col-span-7 relative min-h-[380px] lg:min-h-[440px] flex items-center justify-center border-b lg:border-b-0 lg:border-r border-white/10 overflow-hidden bg-slate-950/40">
          {scriptReady ? (
            <Generic3DViewer
              src={activeItem.model3dUrl}
              fallbackImg={activeItem.imageUrl}
              alt={activeItem.name}
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-bold text-slate-400">Carregando modelo 3D...</span>
            </div>
          )}

          {/* Viewer Overlay Controls */}
          <div className="absolute top-4 left-4 flex items-center gap-2 pointer-events-none">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-400 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Assinatura Ativa
            </span>
          </div>

          <div className="absolute bottom-4 inset-x-4 flex items-center justify-between pointer-events-none text-[10px] font-bold text-slate-400 bg-slate-950/70 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10">
            <span className="flex items-center gap-1.5">
              <RotateCcw className="w-3.5 h-3.5 text-primary" />
              Arraste para girar em 3D · scroll para zoom
            </span>
            <a
              href={activeItem.model3dUrl}
              download
              className="pointer-events-auto text-primary hover:underline flex items-center gap-1"
            >
              <Box className="w-3 h-3" />
              Download .glb
            </a>
          </div>
        </div>

        {/* Details & Specs Sidebar */}
        <div className="lg:col-span-5 p-6 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                  {activeItem.category}
                </span>
                <h3 className="text-2xl font-black text-white flex items-center gap-2 mt-0.5">
                  {activeItem.name}
                </h3>
                <a
                  href={activeItem.providerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-slate-400 hover:text-primary transition inline-flex items-center gap-1 mt-0.5 font-bold"
                >
                  Provedor: {activeItem.provider}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div className="text-right">
                <span className="text-xs text-slate-500 uppercase tracking-widest font-bold">Assinatura Mensal</span>
                <p className="text-2xl font-black text-emerald-400 leading-tight">
                  ${activeItem.monthlyCostUsd.toFixed(2)}
                </p>
                {activeItem.monthlyCostOriginal && (
                  <p className="text-[10px] text-slate-500 font-bold">{activeItem.monthlyCostOriginal} / mês</p>
                )}
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-white/[0.02] p-3 rounded-xl border border-white/5">
              {activeItem.description}
            </p>

            {/* Technical Specifications Grid */}
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Especificações Técnicas</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {activeItem.specs.map((s, idx) => (
                  <div key={idx} className="rounded-xl border border-white/5 bg-slate-950/60 p-2.5">
                    <span className="text-[10px] text-slate-500 uppercase font-bold block">{s.label}</span>
                    <span className="font-bold text-white mt-0.5 block truncate">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-white/5 flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5 font-bold text-slate-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              Verificado no balanço financeiro
            </span>
            <span className="text-[10px] font-mono text-slate-500">ID: {activeItem.id.toUpperCase()}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
