import { useCallback, useState } from 'react';
import { BrainCircuit, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { analyzeAdminAiHealth, readAxiosResponseMessage, type AdminAiHealthMetrics } from '../lib/admin.api';
import { AiHealthDashboard } from './AiHealthDashboard';

export default function AdminAiHealthPage() {
  const [metrics, setMetrics] = useState<AdminAiHealthMetrics | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const res = await analyzeAdminAiHealth();
      if (!res.data.ok || !res.data.metrics) throw new Error(res.data.message ?? 'Falha ao analisar');
      setMetrics(res.data.metrics);
      setReport(res.data.report ?? null);
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao gerar diagnóstico');
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BrainCircuit className="h-8 w-8 text-emerald-400" />
          <div>
            <h1 className="text-2xl font-black text-white">Saúde da plataforma (IA)</h1>
            <p className="text-sm text-slate-500">Métricas reais + parecer automatizado</p>
          </div>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void run()}
          className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-300 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Analisar agora
        </button>
      </header>

      {report ? (
        <article className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-sm leading-relaxed text-slate-200 whitespace-pre-wrap">
          {report}
        </article>
      ) : null}

      {metrics ? <AiHealthDashboard metrics={metrics as Parameters<typeof AiHealthDashboard>[0]['metrics']} /> : null}
    </div>
  );
}
