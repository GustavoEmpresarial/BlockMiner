type Props = {
  size?: string;
  className?: string;
};

/** Placeholder ad slot — production networks mount via ops/public scripts. */
export default function AdBanner({ size = '728x90', className = '' }: Props) {
  return (
    <div
      className={`flex items-center justify-center rounded-xl border border-dashed border-gray-700/80 bg-gray-900/40 text-[10px] font-bold uppercase tracking-widest text-gray-600 ${className}`}
      data-ad-size={size}
      aria-hidden
    >
      Ad {size}
    </div>
  );
}
