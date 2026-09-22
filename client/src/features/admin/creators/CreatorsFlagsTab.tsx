import { useState, useEffect, useRef, type MouseEvent } from 'react';
import { toast } from 'sonner';
import { Youtube, Plus, Trash2, Search, X, Save, ExternalLink, Loader2 } from 'lucide-react';
import { readAxiosResponseMessage } from '../lib/admin.api';
import type { CreatorUser } from './creators.types';
import * as creatorsApi from './creators.api';

export function AddCreatorModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CreatorUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<CreatorUser | null>(null);
  const [ytUrl, setYtUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = (q: string) => {
    if (debounce.current) clearTimeout(debounce.current);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    debounce.current = setTimeout(async () => {
      try {
        const users = await creatorsApi.searchCreators(q);
        setResults(users);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await creatorsApi.upsertCreator(selected.id, ytUrl);
      toast.success(`${selected.username} credenciado como criador!`);
      onAdded();
      onClose();
    } catch (err: unknown) {
      toast.error(readAxiosResponseMessage(err) || 'Erro ao credenciar criador.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md space-y-5 shadow-2xl"
        onClick={(e: MouseEvent) => e.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-black text-white flex items-center gap-2">
            <Youtube className="w-5 h-5 text-red-500" /> Flag isCreator
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-white transition-colors"
            aria-label="Fechar modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!selected ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                autoFocus
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 placeholder:text-slate-600"
                placeholder="Buscar por username..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  search(e.target.value);
                }}
              />
            </div>
            {results.length > 0 ? (
              <div className="space-y-1 max-h-52 overflow-y-auto">
                {results.map((u) => (
                  <button
                    type="button"
                    key={u.id}
                    onClick={() => {
                      setSelected(u);
                      setYtUrl(u.youtubeUrl || '');
                    }}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-slate-800 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-black text-white">
                        {u.username?.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm text-white font-bold">{u.username}</span>
                      <span className="text-xs text-slate-500">{u.name}</span>
                    </div>
                    {u.isCreator ? <Youtube className="w-4 h-4 text-red-500" /> : null}
                  </button>
                ))}
              </div>
            ) : null}
            {searching ? <p className="text-xs text-slate-500 text-center">Buscando...</p> : null}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 px-3 py-2 bg-slate-800 rounded-xl">
              <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-black text-white">
                {selected.username?.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-black text-white">{selected.username}</p>
                <p className="text-xs text-slate-500">{selected.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="ml-auto text-slate-500 hover:text-white transition-colors"
                aria-label="Limpar seleção"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Link do Canal YouTube
              </label>
              <input
                autoFocus
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-red-500/50 placeholder:text-slate-600"
                placeholder="https://youtube.com/@canal"
                value={ytUrl}
                onChange={(e) => setYtUrl(e.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-sm transition-colors disabled:opacity-40"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Youtube className="w-4 h-4" />}
              {saving ? 'Salvando...' : 'Marcar isCreator'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function CreatorsFlagsTab() {
  const [creators, setCreators] = useState<CreatorUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editUrl, setEditUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setIsLoading(true);
    try {
      const data = await creatorsApi.listCreators();
      setCreators(data);
    } catch {
      toast.error('Erro ao carregar criadores.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleRemove = async (id: number, username: string | null | undefined) => {
    if (!confirm(`Remover flag isCreator de @${username}?`)) return;
    try {
      await creatorsApi.removeCreator(id);
      toast.success('Flag removida com sucesso.');
      setCreators((c) => c.filter((x) => x.id !== id));
    } catch (err: unknown) {
      toast.error(readAxiosResponseMessage(err) || 'Erro ao remover flag.');
    }
  };

  const handleEditSave = async (id: number) => {
    setSaving(true);
    try {
      await creatorsApi.upsertCreator(id, editUrl);
      toast.success('Link do canal atualizado!');
      setEditingId(null);
      setCreators((c) => c.map((x) => (x.id === id ? { ...x, youtubeUrl: editUrl } : x)));
    } catch (err: unknown) {
      toast.error(readAxiosResponseMessage(err) || 'Erro ao atualizar link.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {showAdd ? <AddCreatorModal onClose={() => setShowAdd(false)} onAdded={() => void load()} /> : null}

      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
          {creators.length} flag(s) isCreator — separado dos perfis Social
        </p>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-black text-xs rounded-xl transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Credenciar
        </button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-500 text-sm flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-red-500" />
            Carregando criadores...
          </div>
        ) : creators.length === 0 ? (
          <div className="p-12 flex flex-col items-center gap-3 text-slate-600">
            <Youtube className="w-10 h-10 opacity-30" />
            <p className="text-sm font-bold">Nenhum usuário com flag isCreator.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/50 text-[10px] uppercase tracking-widest font-black text-slate-500">
                <tr>
                  <th className="px-6 py-4 text-left">Usuário</th>
                  <th className="px-6 py-4 text-left hidden md:table-cell">Canal YouTube</th>
                  <th className="px-6 py-4 text-left hidden md:table-cell">Desde</th>
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {creators.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-800/20 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-xs font-black text-white">
                          {c.username?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-black text-white">{c.username}</p>
                          <p className="text-xs text-slate-500">{c.name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 hidden md:table-cell">
                      {editingId === c.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            autoFocus
                            className="bg-slate-950 border border-slate-600 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-red-500/50 w-64"
                            value={editUrl}
                            onChange={(e) => setEditUrl(e.target.value)}
                            placeholder="https://youtube.com/@canal"
                          />
                          <button
                            type="button"
                            onClick={() => void handleEditSave(c.id)}
                            disabled={saving}
                            className="p-1.5 bg-red-600 hover:bg-red-500 rounded-lg text-white transition-colors disabled:opacity-40"
                            title="Salvar alterações"
                          >
                            <Save className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="p-1.5 text-slate-500 hover:text-white transition-colors"
                            title="Cancelar edição"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : c.youtubeUrl ? (
                        <a
                          href={c.youtubeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors font-bold truncate max-w-xs"
                        >
                          <Youtube className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate">
                            {c.youtubeUrl.replace('https://', '').replace('http://', '')}
                          </span>
                          <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        </a>
                      ) : (
                        <span className="text-xs text-slate-600 italic">sem link</span>
                      )}
                    </td>
                    <td className="px-6 py-4 hidden md:table-cell text-xs text-slate-500">
                      {c.createdAt ? new Date(c.createdAt).toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(c.id);
                            setEditUrl(c.youtubeUrl || '');
                          }}
                          className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                          title="Editar link"
                        >
                          <Youtube className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleRemove(c.id, c.username)}
                          className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                          title="Remover flag"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
