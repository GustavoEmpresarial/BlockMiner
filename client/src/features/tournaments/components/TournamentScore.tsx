import { formatScoreValue, formatScoreWithPolHint } from '../lib/tournamentMetricDisplay';

type Align = 'end' | 'center';

export function TournamentScore({
  score,
  metric,
  polHint,
  align = 'end',
}: {
  score: number;
  metric: string;
  polHint?: number | null;
  align?: Align;
}) {
  const alignClass = align === 'center' ? 'items-center' : 'items-end';

  if (metric !== 'DEPOSITS_USD') {
    return <span>{formatScoreValue(metric, score)}</span>;
  }

  const { primary, secondary } = formatScoreWithPolHint(metric, score, polHint);
  return (
    <span className={`inline-flex flex-col ${alignClass} leading-tight`}>
      <span>{primary}</span>
      {secondary ? <span className="text-[10px] text-slate-500 font-normal">{secondary}</span> : null}
    </span>
  );
}
