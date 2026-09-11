import { useId } from 'react';

type MiningRackShelfProps = {
  className?: string;
};

/** Catalog / offer art for the 2-shelf mining rack (matches `/media/racks/default-shelf.svg`). */
export function MiningRackShelf({ className = 'h-auto w-full' }: MiningRackShelfProps) {
  const uid = useId().replace(/:/g, '');
  const chassis = `${uid}-chassis`;
  const rail = `${uid}-rail`;
  const shelf = `${uid}-shelf`;
  const lip = `${uid}-lip`;
  return (
    <svg viewBox="0 0 800 500" className={className} role="img" aria-label="Mining rack">
      <defs>
        <linearGradient id={chassis} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a4150" />
          <stop offset="1" stopColor="#1c212b" />
        </linearGradient>
        <linearGradient id={rail} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5b6578" />
          <stop offset="1" stopColor="#2b313d" />
        </linearGradient>
        <linearGradient id={shelf} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0a0d12" />
          <stop offset="1" stopColor="#151a23" />
        </linearGradient>
        <linearGradient id={lip} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6b7384" />
          <stop offset="1" stopColor="#3a4150" />
        </linearGradient>
      </defs>
      <rect width="800" height="500" rx="18" fill="#12151c" />
      <rect x="16" y="16" width="768" height="468" rx="14" fill={`url(#${chassis})`} stroke="#6b7384" strokeWidth="3" />
      <rect x="28" y="28" width="744" height="58" rx="8" fill={`url(#${rail})`} />
      <g fill="#8b93a3">
        <rect x="48" y="42" width="22" height="8" rx="2" />
        <rect x="78" y="42" width="22" height="8" rx="2" />
        <rect x="108" y="42" width="22" height="8" rx="2" />
        <rect x="138" y="42" width="22" height="8" rx="2" />
        <rect x="168" y="42" width="22" height="8" rx="2" />
        <rect x="198" y="42" width="22" height="8" rx="2" />
      </g>
      <circle cx="740" cy="57" r="7" fill="#22c55e" />
      <circle cx="716" cy="57" r="5" fill="#f59e0b" />
      <rect x="28" y="88" width="18" height="380" rx="4" fill="#2a303c" />
      <rect x="754" y="88" width="18" height="380" rx="4" fill="#2a303c" />
      <rect x="52" y="100" width="696" height="180" rx="10" fill={`url(#${shelf})`} />
      <rect x="52" y="268" width="696" height="12" rx="3" fill={`url(#${lip})`} />
      <rect x="52" y="292.5" width="696" height="180" rx="10" fill={`url(#${shelf})`} />
      <rect x="52" y="460.5" width="696" height="12" rx="3" fill={`url(#${lip})`} />
    </svg>
  );
}
