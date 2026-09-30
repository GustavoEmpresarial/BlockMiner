import React, { useEffect, useState, useMemo } from 'react';
import { Loader2, Save, RotateCcw, Search, Code, LayoutGrid, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { adminSidebarNavApi } from './adminSidebarNav.api';
import type {
  SidebarAdminItemMeta,
  SidebarPersistedEntry,
  SidebarSection,
} from './adminSidebarNav.types';
import { SidebarNavStats } from './components/SidebarNavStats';
import { SidebarSectionCard } from './components/SidebarSectionCard';
import { readAxiosResponseMessage } from '../lib/admin.api';

export default function AdminUserSidebarPage() {
  const [entries, setEntries] = useState<SidebarPersistedEntry[]>([]);
  const [initialEntriesJson, setInitialEntriesJson] = useState<string>('[]');
  const [itemMeta, setItemMeta] = useState<Record<string, SidebarAdminItemMeta>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'visual' | 'json'>('visual');
  const [jsonText, setJsonText] = useState('[]');

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await adminSidebarNavApi.getNavConfig();
      if (res.data?.ok) {
        const sorted = [...(res.data.entries || [])].sort((a, b) => a.sortOrder - b.sortOrder);
        setEntries(sorted);
        setInitialEntriesJson(JSON.stringify(sorted));
        setJsonText(JSON.stringify(sorted, null, 2));
        setItemMeta(res.data.itemMeta || {});
      }
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao carregar configuração da sidebar');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const isDirty = useMemo(() => {
    return JSON.stringify(entries) !== initialEntriesJson;
  }, [entries, initialEntriesJson]);

  const handleToggleVisibility = (itemId: string) => {
    if (itemId === 'zerads') return; // Immutable hardcoded hidden override
    setEntries((prev) => {
      const updated = prev.map((item) =>
        item.itemId === itemId ? { ...item, visible: !item.visible } : item
      );
      setJsonText(JSON.stringify(updated, null, 2));
      return updated;
    });
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= entries.length) return;

    setEntries((prev) => {
      const copy = [...prev];
      const current = copy[index];
      const target = copy[targetIndex];

      // Swap positions and sortOrders
      copy[index] = target;
      copy[targetIndex] = current;

      // Re-normalize sortOrders sequentially by 10s
      const renumbered = copy.map((item, idx) => ({
        ...item,
        sortOrder: (idx + 1) * 10,
      }));

      setJsonText(JSON.stringify(renumbered, null, 2));
      return renumbered;
    });
  };

  const handleApplyJson = () => {
    try {
      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed)) {
        toast.error('O payload JSON deve ser uma lista de entradas (array)');
        return;
      }
      setEntries(parsed as SidebarPersistedEntry[]);
      toast.success('JSON aplicado à visualização com sucesso');
    } catch {
      toast.error('Erro de sintaxe no JSON. Verifique a formatação.');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await adminSidebarNavApi.updateNavConfig(entries);
      if (res.data?.ok) {
        const sorted = [...(res.data.entries || [])].sort((a, b) => a.sortOrder - b.sortOrder);
        setEntries(sorted);
        setInitialEntriesJson(JSON.stringify(sorted));
        setJsonText(JSON.stringify(sorted, null, 2));
        toast.success('Configuração da sidebar atualizada com sucesso!');
      } else {
        toast.error(res.data?.code ? `Erro: ${res.data.code}` : 'Falha ao salvar sidebar');
      }
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao salvar alterações');
    } finally {
      setSaving(false);
    }
  };

  const filteredEntries = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase().trim();
    return entries.filter(
      (e) =>
        e.itemId.toLowerCase().includes(q) ||
        itemMeta[e.itemId]?.labelKey?.toLowerCase().includes(q)
    );
  }, [entries, search, itemMeta]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">Sidebar do App (Menu do Usuário)</h1>
          <p className="mt-1 text-xs text-slate-400">
            Gerenciamento de módulos, ordem de exibição e <strong>Kill Switch Operacional (403)</strong> para jogadores.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex rounded-xl border border-white/10 bg-slate-900/60 p-1">
            <button
              type="button"
              onClick={() => setViewMode('visual')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                viewMode === 'visual' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>Visual</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('json')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                viewMode === 'json' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Code className="h-3.5 w-3.5" />
              <span>JSON Avançado</span>
            </button>
          </div>

          {/* Reset / Reload Button */}
          <button
            type="button"
            disabled={saving || !isDirty}
            onClick={() => void loadData()}
            title="Descartar alterações locais e recarregar do servidor"
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 disabled:pointer-events-none disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Descartar</span>
          </button>

          {/* Save Button */}
          <button
            type="button"
            disabled={saving || !isDirty}
            onClick={() => void handleSave()}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-amber-500/20 transition-all hover:from-amber-400 hover:to-amber-500 disabled:pointer-events-none disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span>Salvar Alterações</span>
            {isDirty && !saving && (
              <span className="flex h-2 w-2 rounded-full bg-slate-950 animate-pulse" />
            )}
          </button>
        </div>
      </div>

      {/* KPI Stats Panel */}
      <SidebarNavStats entries={entries} />

      {/* Search and Filters */}
      {viewMode === 'visual' && (
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar item ou módulo por ID ou nome..."
              className="w-full rounded-xl border border-white/10 bg-slate-900/40 py-2.5 pl-10 pr-4 text-xs text-white placeholder-slate-500 focus:border-amber-500/50 focus:outline-none"
            />
          </div>
          {isDirty && (
            <div className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-300">
              <AlertCircle className="h-3.5 w-3.5" />
              <span>Alterações pendentes de salvamento</span>
            </div>
          )}
        </div>
      )}

      {/* Main View: Visual Cards per Section */}
      {viewMode === 'visual' ? (
        <div className="space-y-6">
          <SidebarSectionCard
            section="main"
            title="Seção Principal"
            description="Módulos operacionais e páginas core do jogo visíveis no topo do menu."
            entries={filteredEntries}
            itemMeta={itemMeta}
            onMoveUp={(idx) => handleMove(idx, 'up')}
            onMoveDown={(idx) => handleMove(idx, 'down')}
            onToggleVisibility={handleToggleVisibility}
          />

          <SidebarSectionCard
            section="earn"
            title="Seção Ganhar & Recompensas"
            description="Módulos de monetização e recompensas. Inclui itens agrupados sob 'Grupo Recompensas'."
            entries={filteredEntries}
            itemMeta={itemMeta}
            onMoveUp={(idx) => handleMove(idx, 'up')}
            onMoveDown={(idx) => handleMove(idx, 'down')}
            onToggleVisibility={handleToggleVisibility}
          />

          <SidebarSectionCard
            section="social"
            title="Seção Social, Comunidade & Governança"
            description="Feed de vídeos, transparência, sistema de afiliados e recursos sociais."
            entries={filteredEntries}
            itemMeta={itemMeta}
            onMoveUp={(idx) => handleMove(idx, 'up')}
            onMoveDown={(idx) => handleMove(idx, 'down')}
            onToggleVisibility={handleToggleVisibility}
          />
        </div>
      ) : (
        /* Advanced JSON View */
        <div className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/40 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">Editor JSON Bruto</h2>
            <button
              type="button"
              onClick={handleApplyJson}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-500/20 px-3 py-1.5 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/30"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Aplicar JSON ao Estado</span>
            </button>
          </div>
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            className="h-96 w-full rounded-xl border border-white/10 bg-slate-950 p-4 font-mono text-xs text-slate-200 focus:border-amber-500/50 focus:outline-none"
          />
        </div>
      )}
    </div>
  );
}
