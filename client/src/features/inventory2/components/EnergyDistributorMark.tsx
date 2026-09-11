type EnergyDistributorMarkProps = {
  className?: string;
  lit?: boolean;
};

/** Industrial solar panel + feeder used as the inventory2 distributor mark. */
export function EnergyDistributorMark({ className = 'h-16 w-16', lit = true }: EnergyDistributorMarkProps) {
  const cell = lit ? '#f59e0b' : '#334155';
  const cellHi = lit ? '#fcd34d' : '#475569';
  const frame = lit ? '#fb923c' : '#64748b';
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <path d="M18 54h28l-4 6H22z" fill="#1e293b" stroke={frame} strokeWidth="1.4" />
      <path d="M32 36v18" fill="none" stroke={frame} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M8 18l24-10 24 10v16L32 44 8 34z" fill="#0f172a" stroke={frame} strokeWidth="1.8" />
      <path d="M12 20.5l20-8.2 20 8.2v11.4L32 40 12 31.9z" fill="none" stroke={cell} strokeWidth="1.1" />
      <path d="M32 12.3v27.7M16.4 22.2l31.2 12.8M47.6 22.2L16.4 35" fill="none" stroke={cellHi} strokeWidth="1" />
    </svg>
  );
}
