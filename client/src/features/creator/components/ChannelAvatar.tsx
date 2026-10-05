export function ChannelAvatar({ photo, name }: { photo?: string | null; name?: string }) {
  if (photo) {
    return (
      <img src={photo} alt="" className="w-10 h-10 rounded-xl object-cover border-2 border-slate-800 shadow-[2px_2px_0px_#000000] shrink-0" />
    );
  }
  return (
    <div className="w-10 h-10 rounded-xl bg-red-500/20 border-2 border-slate-800 shadow-[2px_2px_0px_#000000] flex items-center justify-center text-sm font-black text-red-300 shrink-0 font-mono">
      {(name || '?').charAt(0).toUpperCase()}
    </div>
  );
}
