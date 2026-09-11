import { useId } from 'react';

type CoolingFanUnitProps = {
  spinning?: boolean;
  className?: string;
};

function FanRotor({ cx, cy, r, spinning, delay }: { cx: number; cy: number; r: number; spinning?: boolean; delay: string }) {
  const blade = r * 0.78;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r + 6} fill="#2a303c" stroke="#6b7384" strokeWidth="3" />
      <circle cx={cx} cy={cy} r={r + 2} fill="#151a23" stroke="#3a4150" strokeWidth="2" />
      <g className={spinning ? 'rack-fan-spin' : undefined} style={spinning ? { animationDelay: delay } : undefined}>
        <path d={`M${cx} ${cy} L${cx + blade * 0.18} ${cy - blade} A${blade} ${blade} 0 0 1 ${cx + blade * 0.72} ${cy - blade * 0.55} Z`} fill="#8b93a3" />
        <path d={`M${cx} ${cy} L${cx + blade} ${cy + blade * 0.12} A${blade} ${blade} 0 0 1 ${cx + blade * 0.42} ${cy + blade * 0.78} Z`} fill="#6b7384" />
        <path d={`M${cx} ${cy} L${cx - blade * 0.28} ${cy + blade} A${blade} ${blade} 0 0 1 ${cx - blade * 0.82} ${cy + blade * 0.28} Z`} fill="#8b93a3" />
        <path d={`M${cx} ${cy} L${cx - blade} ${cy - blade * 0.22} A${blade} ${blade} 0 0 1 ${cx - blade * 0.38} ${cy - blade * 0.84} Z`} fill="#5b6578" />
        <path d={`M${cx} ${cy} L${cx + blade * 0.55} ${cy + blade * 0.82} A${blade} ${blade} 0 0 1 ${cx - blade * 0.12} ${cy + blade} Z`} fill="#9aa3b2" opacity="0.85" />
      </g>
      <circle cx={cx} cy={cy} r={r * 0.28} fill="#1c212b" stroke="#8b93a3" strokeWidth="2" />
      <circle cx={cx} cy={cy} r={r * 0.1} fill={spinning ? '#f59e0b' : '#3a4150'} />
    </g>
  );
}

/** Industrial cooling tray that sits under an inventory2 rack. */
export function CoolingFanUnit({ spinning = false, className = 'h-auto w-full' }: CoolingFanUnitProps) {
  const uid = useId().replace(/:/g, '');
  const chassis = `${uid}-chassis`;
  const rail = `${uid}-rail`;
  const lip = `${uid}-lip`;
  return (
    <svg viewBox="0 0 800 220" className={className} aria-hidden>
      <defs>
        <linearGradient id={chassis} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a4150" />
          <stop offset="1" stopColor="#1c212b" />
        </linearGradient>
        <linearGradient id={rail} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5b6578" />
          <stop offset="1" stopColor="#2b313d" />
        </linearGradient>
        <linearGradient id={lip} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6b7384" />
          <stop offset="1" stopColor="#3a4150" />
        </linearGradient>
      </defs>
      <rect width="800" height="220" rx="16" fill="#12151c" />
      <rect x="12" y="12" width="776" height="196" rx="14" fill={`url(#${chassis})`} stroke="#6b7384" strokeWidth="3" />
      <rect x="24" y="22" width="752" height="28" rx="6" fill={`url(#${rail})`} />
      <g fill="#8b93a3">
        <rect x="40" y="30" width="16" height="6" rx="1.5" />
        <rect x="62" y="30" width="16" height="6" rx="1.5" />
        <rect x="84" y="30" width="16" height="6" rx="1.5" />
        <rect x="106" y="30" width="16" height="6" rx="1.5" />
      </g>
      <circle cx="748" cy="36" r="5" fill={spinning ? '#22c55e' : '#475569'} />
      <circle cx="728" cy="36" r="4" fill={spinning ? '#f59e0b' : '#334155'} />
      <rect x="24" y="178" width="752" height="18" rx="4" fill={`url(#${lip})`} />
      <FanRotor cx={168} cy={118} r={62} spinning={spinning} delay="0s" />
      <FanRotor cx={400} cy={118} r={62} spinning={spinning} delay="0.12s" />
      <FanRotor cx={632} cy={118} r={62} spinning={spinning} delay="0.24s" />
    </svg>
  );
}
