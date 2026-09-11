import { Copy, CheckCircle2 } from 'lucide-react';
import type { DecoratedRow } from '../adminClientErrors.types';
import { formatTime } from '../adminClientErrors.logic';
import { CriticalityBadge, CategoryBadge } from './CriticalityBadge';

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="break-all font-mono text-slate-300">{value}</p>
    </div>
  );
}

export function ClientErrorCard({
  row,
  copied,
  onCopy,
}: {
  row: DecoratedRow;
  copied: boolean;
  onCopy: (row: DecoratedRow) => void;
}) {
  const meta = row.metadata ?? {};
  return (
    <article className="overflow-hidden rounded-xl border border-white/10 bg-slate-900/50">
      <header className="flex items-start gap-3 border-b border-white/5 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <CriticalityBadge criticality={row.criticality} />
            <CategoryBadge category={row.category} />
            <span className="rounded bg-slate-700/60 px-1.5 py-0.5 font-mono text-[9px] text-slate-300">
              {row.endpoint}
            </span>
            {meta.statusCode != null && (
              <span className="rounded bg-slate-700/60 px-1.5 py-0.5 font-mono text-[9px] text-slate-300">
                HTTP {meta.statusCode}
              </span>
            )}
            {meta.code && (
              <span className="rounded bg-slate-700/60 px-1.5 py-0.5 font-mono text-[9px] text-slate-300">
                {meta.code}
              </span>
            )}
          </div>
          <p className="mt-1 break-words text-sm font-bold text-white">{row.label}</p>
          <p className="mt-0.5 font-mono text-[11px] text-slate-500">
            #{row.id} · {formatTime(row.createdAt)}
            {meta.requestId ? ` · req ${meta.requestId}` : ''}
          </p>
        </div>
        <button
          onClick={() => onCopy(row)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-slate-800/80 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/5"
        >
          {copied ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              Copiado
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              Copiar
            </>
          )}
        </button>
      </header>

      <div className="space-y-3 px-4 py-3 text-xs">
        <div className="grid gap-2 sm:grid-cols-2">
          <Meta label="URL" value={meta.url ?? '—'} />
          <Meta label="IP" value={row.ip ?? '—'} />
          <Meta label="Build" value={meta.buildId ?? '—'} />
          <Meta label="User-Agent" value={row.userAgent ?? '—'} />
        </div>

        {(meta.stack || row.description) && (
          <details open>
            <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-slate-500 hover:text-slate-300">
              Stack
            </summary>
            <pre className="mt-2 whitespace-pre-wrap break-all rounded-lg border border-white/5 bg-slate-950/80 p-3 font-mono text-[11px] text-red-300">
              {meta.stack || row.description}
            </pre>
          </details>
        )}

        {meta.componentStack && (
          <details>
            <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-slate-500 hover:text-slate-300">
              Component stack
            </summary>
            <pre className="mt-2 whitespace-pre-wrap break-all rounded-lg border border-white/5 bg-slate-950/80 p-3 font-mono text-[11px] text-slate-400">
              {meta.componentStack}
            </pre>
          </details>
        )}
      </div>
    </article>
  );
}
