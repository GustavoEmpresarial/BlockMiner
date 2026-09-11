import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { reportClientCrash } from "../shared/utils/clientErrorTelemetry";

/** Official community Telegram (same default as LandingPage / VITE_TELEGRAM_URL). */
export const BM_SUPPORT_TELEGRAM_URL = "https://t.me/+KPgyUFtKCZ00Y2Vh";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
  copied: boolean;
};

function buildReportText(error: Error | null, componentStack: string | null): string {
  const lines = [
    "BlockMiner — relatório de erro de interface",
    `URL: ${typeof window !== "undefined" ? window.location.href : "(n/a)"}`,
    `UA: ${typeof navigator !== "undefined" ? navigator.userAgent : "(n/a)"}`,
    `Quando: ${new Date().toISOString()}`,
    "",
    `Mensagem: ${error?.message || "(sem mensagem)"}`,
    "",
    "Stack:",
    error?.stack || "(sem stack)",
    "",
    "Component stack:",
    componentStack || "(sem component stack)",
  ];
  return lines.join("\n");
}

/**
 * Top-level React boundary. Shows error details + copy + Telegram when a
 * screen crashes (chunk 404 / render errors). window.onerror does not see
 * errors swallowed by componentDidCatch.
 */
export default class RootErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, componentStack: null, copied: false };

  constructor(props: Props) {
    super(props);
    this.handleReload = this.handleReload.bind(this);
    this.handleCopy = this.handleCopy.bind(this);
  }

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return {
      hasError: true,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[RootErrorBoundary]", error, info);
    this.setState({ componentStack: info.componentStack ?? null });
    reportClientCrash({
      message: error.message || String(error),
      stack: error.stack ?? null,
      componentStack: info.componentStack ?? null,
      operation: "root_error_boundary",
    });
  }

  handleReload(): void {
    window.location.reload();
  }

  async handleCopy(): Promise<void> {
    const text = buildReportText(this.state.error, this.state.componentStack);
    try {
      await navigator.clipboard.writeText(text);
      this.setState({ copied: true });
      window.setTimeout(() => this.setState({ copied: false }), 2500);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        this.setState({ copied: true });
        window.setTimeout(() => this.setState({ copied: false }), 2500);
      } catch {
        /* ignore */
      }
    }
  }

  render() {
    if (this.state.hasError) {
      const msg = this.state.error?.message || "Erro desconhecido";
      return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950 p-6 overflow-y-auto">
          <div className="max-w-lg w-full rounded-2xl border border-primary/20 bg-primary/5 p-8 flex flex-col items-center gap-4 text-center my-6">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-primary" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-black text-red-300 uppercase tracking-wide mb-1">
                Algo deu errado
              </p>
              <p className="text-xs text-gray-500">
                Não foi possível carregar esta tela. Copie o erro, envie no Telegram oficial, limpe os
                dados do navegador e recarregue — se continuar, tente outro navegador.
              </p>
            </div>

            <pre
              className="w-full max-h-40 overflow-auto text-left text-[10px] leading-relaxed font-mono text-red-300/90 bg-slate-950/80 border border-white/10 rounded-xl p-3 whitespace-pre-wrap break-all"
              data-testid="root-error-details"
            >
              {msg}
              {this.state.error?.stack ? `\n\n${this.state.error.stack}` : ""}
            </pre>

            <div className="flex flex-wrap items-center justify-center gap-2 w-full">
              <button
                type="button"
                onClick={() => void this.handleCopy()}
                className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors"
              >
                <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                {this.state.copied ? "Copiado" : "Copiar erro"}
              </button>
              <a
                href={BM_SUPPORT_TELEGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-[#229ED9]/90 hover:bg-[#229ED9] text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-colors no-underline"
              >
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                Telegram oficial
              </a>
              <button
                type="button"
                onClick={this.handleReload}
                className="flex items-center gap-2 px-4 py-2 bg-primary/20 border border-primary/30 hover:bg-primary/30 text-primary rounded-xl text-xs font-bold uppercase tracking-widest transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                Recarregar
              </button>
            </div>

            <div className="text-[10px] text-slate-500 max-w-sm space-y-2 text-left">
              <p>
                <span className="text-slate-300 font-bold">1.</span> Limpe os dados do site / cache (
                <kbd className="font-mono bg-slate-900 px-1 rounded">Ctrl+Shift+Del</kbd>
                no PC, ou Configurações → Dados de navegação no celular) e abra de novo.
              </p>
              <p>
                <span className="text-slate-300 font-bold">2.</span> Se ainda falhar, tente outro
                navegador (Chrome, Edge, Firefox) ou uma janela anônima.
              </p>
              <p>
                <span className="text-slate-300 font-bold">3.</span> Cole o erro copiado no Telegram
                oficial e avise um admin.
              </p>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children ?? null;
  }
}
