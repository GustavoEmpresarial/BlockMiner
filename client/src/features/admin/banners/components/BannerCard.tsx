import { useState } from 'react';
import { Pencil, Trash2, ToggleLeft, ToggleRight, ExternalLink } from 'lucide-react';
import type { AdminBannerRow } from '../banners.types';
import { TypeBadge, isVideoMediaUrl, resolveBannerMediaUrl } from '../banners.shared';

export interface BannerCardProps {
  banner: AdminBannerRow;
  onEdit: (banner: AdminBannerRow) => void;
  onToggle: (banner: AdminBannerRow) => void;
  onDelete: (id: number) => void;
}

export function BannerCard({ banner, onEdit, onToggle, onDelete }: BannerCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const mediaUrl = resolveBannerMediaUrl(banner.imageUrl);

  return (
    <div
      className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl border transition-all ${
        banner.isActive
          ? 'bg-slate-900 border-slate-700/80 shadow-sm'
          : 'bg-slate-950/70 border-slate-800/80 opacity-60'
      }`}
    >
      <div className="flex items-start gap-4 min-w-0 flex-1">
        {mediaUrl ? (
          <div className="w-24 h-14 rounded-xl overflow-hidden shrink-0 bg-slate-950 border border-slate-800">
            {isVideoMediaUrl(mediaUrl) ? (
              <video
                src={mediaUrl}
                className="w-full h-full object-cover"
                autoPlay
                muted
                loop
                playsInline
              />
            ) : (
              <img
                src={mediaUrl}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            )}
          </div>
        ) : null}

        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <TypeBadge type={banner.type} />
            {!banner.isActive ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase border bg-slate-800 text-slate-500 border-slate-700">
                Inativo
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                Visível
              </span>
            )}
          </div>

          <h3 className="text-sm font-bold text-white truncate">{banner.title}</h3>

          {banner.message ? (
            <p className="text-xs text-slate-400 line-clamp-2">{banner.message}</p>
          ) : null}

          <div className="flex items-center gap-3 flex-wrap text-xs text-slate-500">
            {banner.link ? (
              <span className="flex items-center gap-1 font-mono text-[11px] text-amber-400/80 truncate max-w-[260px]">
                <ExternalLink className="w-3 h-3 shrink-0" />
                {banner.link}
              </span>
            ) : null}

            {banner.linkLabel ? (
              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300 font-medium">
                Botão: {banner.linkLabel}
              </span>
            ) : null}
          </div>

          {banner.startsAt || banner.endsAt ? (
            <p className="text-[10px] text-slate-500">
              {banner.startsAt ? `De: ${new Date(banner.startsAt).toLocaleString('pt-BR')}` : ''}
              {banner.startsAt && banner.endsAt ? ' · ' : ''}
              {banner.endsAt ? `Até: ${new Date(banner.endsAt).toLocaleString('pt-BR')}` : ''}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
        {confirmDelete ? (
          <div className="flex items-center gap-1.5 bg-red-950/60 border border-red-800/80 px-2 py-1 rounded-xl">
            <span className="text-[11px] font-bold text-red-300">Excluir?</span>
            <button
              type="button"
              onClick={() => {
                onDelete(banner.id);
                setConfirmDelete(false);
              }}
              className="px-2 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[11px] font-bold transition-colors"
            >
              Sim
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold transition-colors"
            >
              Não
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onToggle(banner)}
              className={`p-2 rounded-xl border transition-colors ${
                banner.isActive
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
                  : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'
              }`}
              title={banner.isActive ? 'Desativar banner' : 'Ativar banner'}
              aria-label={banner.isActive ? 'Desativar banner' : 'Ativar banner'}
            >
              {banner.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => onEdit(banner)}
              className="p-2 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
              title="Editar banner"
              aria-label="Editar banner"
            >
              <Pencil className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="p-2 rounded-xl border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors"
              title="Excluir banner"
              aria-label="Excluir banner"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
