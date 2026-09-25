import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Plus, Megaphone } from 'lucide-react';
import type { AdminBannerRow, BannerFormState } from './banners.types';
import { EMPTY_BANNER_FORM } from './banners.types';
import { mergeBannerInitial } from './banners.shared';
import {
  listAdminBanners,
  createAdminBanner,
  updateAdminBanner,
  toggleAdminBanner,
  deleteAdminBanner,
} from './banners.api';
import { BannerForm } from './components/BannerForm';
import { BannerCard } from './components/BannerCard';

export default function AdminBanners() {
  const [banners, setBanners] = useState<AdminBannerRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await listAdminBanners();
      setBanners(data);
    } catch {
      toast.error('Erro ao carregar banners.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async (form: BannerFormState) => {
    setIsSaving(true);
    try {
      const res = await createAdminBanner(form);
      if (res.ok) {
        toast.success('Banner criado com sucesso!');
        setShowCreate(false);
        await load();
      } else {
        toast.error(res.message || 'Erro ao criar banner.');
      }
    } catch {
      toast.error('Erro inesperado ao criar banner.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async (form: BannerFormState) => {
    if (editingId == null) return;
    setIsSaving(true);
    try {
      const res = await updateAdminBanner(editingId, form);
      if (res.ok) {
        toast.success('Banner atualizado com sucesso!');
        setEditingId(null);
        await load();
      } else {
        toast.error(res.message || 'Erro ao atualizar banner.');
      }
    } catch {
      toast.error('Erro inesperado ao atualizar banner.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle = async (banner: AdminBannerRow) => {
    const nextState = !banner.isActive;
    try {
      const ok = await toggleAdminBanner(banner.id, nextState);
      if (ok) {
        toast.success(nextState ? 'Banner ativado!' : 'Banner desativado!');
        await load();
      } else {
        toast.error('Erro ao alterar status do banner.');
      }
    } catch {
      toast.error('Erro ao alterar status do banner.');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const ok = await deleteAdminBanner(id);
      if (ok) {
        toast.success('Banner excluído com sucesso.');
        await load();
      } else {
        toast.error('Erro ao excluir banner.');
      }
    } catch {
      toast.error('Erro ao excluir banner.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Megaphone className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Banners do Dashboard</h1>
            <p className="text-xs text-slate-500">
              {isLoading ? 'Carregando…' : `${banners.length} banner(s) cadastrado(s)`}
            </p>
          </div>
        </div>

        {!showCreate ? (
          <button
            type="button"
            onClick={() => {
              setShowCreate(true);
              setEditingId(null);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-sm transition-colors"
          >
            <Plus className="w-4 h-4" /> Novo Banner
          </button>
        ) : null}
      </div>

      {showCreate ? (
        <BannerForm
          initial={EMPTY_BANNER_FORM}
          onSave={handleCreate}
          onCancel={() => setShowCreate(false)}
          isSaving={isSaving}
        />
      ) : null}

      {isLoading ? (
        <div className="text-center py-16 text-slate-500">Carregando…</div>
      ) : banners.length === 0 ? (
        <div className="text-center py-16 text-slate-500 border border-dashed border-slate-800 rounded-2xl">
          <Megaphone className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-bold">Nenhum banner cadastrado</p>
        </div>
      ) : (
        <div className="space-y-3">
          {banners.map((banner) => (
            <div key={banner.id}>
              {editingId === banner.id ? (
                <BannerForm
                  key={banner.id}
                  initial={mergeBannerInitial(banner)}
                  onSave={handleUpdate}
                  onCancel={() => setEditingId(null)}
                  isSaving={isSaving}
                />
              ) : (
                <BannerCard
                  banner={banner}
                  onEdit={(b) => {
                    setEditingId(b.id);
                    setShowCreate(false);
                  }}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
