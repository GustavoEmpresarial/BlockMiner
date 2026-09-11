type Props = {
  className?: string;
};

export default function MondiadBanner({ className = '' }: Props) {
  return (
    <div
      className={`flex min-h-[90px] items-center justify-center rounded-xl border border-dashed border-gray-700/80 bg-gray-900/40 text-[10px] font-bold uppercase tracking-widest text-gray-600 ${className}`}
      aria-hidden
    >
      Mondiad
    </div>
  );
}
