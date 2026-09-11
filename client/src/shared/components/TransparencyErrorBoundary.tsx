import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { reportClientCrash } from '../utils/clientErrorTelemetry';

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

export default class TransparencyErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[TransparencyErrorBoundary]', error, info.componentStack);
    reportClientCrash({
      message: error.message || String(error),
      stack: error.stack ?? null,
      componentStack: info.componentStack ?? null,
      operation: 'transparency_error_boundary',
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="rounded-2xl border border-red-500/20 bg-red-500/5 p-8 text-center space-y-3"
          data-testid="transparency-error-boundary"
        >
          <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" aria-hidden="true" />
          <p className="text-sm font-bold text-red-300">Portal de Transparência indisponível</p>
          <p className="text-xs text-gray-500">Recarregue a página. Se o problema persistir, contacte o suporte.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-xs font-black uppercase tracking-widest text-primary hover:underline"
          >
            Recarregar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
