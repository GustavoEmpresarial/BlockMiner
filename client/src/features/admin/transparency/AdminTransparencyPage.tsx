import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Receipt, Wallet, Cpu, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../shared/auth/auth.store';
import { readAxiosResponseMessage } from '../lib/admin.api';
import type { TransparencyEntryRow } from './components/adminTransparency.types';
import TransparencyEntriesTab from './components/TransparencyEntriesTab';
import TrackedWalletsTab from './components/TrackedWalletsTab';
import HardwareAssetsTab from './components/HardwareAssetsTab';

type TabKey = 'entries' | 'wallets' | 'hardware';

export default function AdminTransparencyPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('entries');
  const [entries, setEntries] = useState<TransparencyEntryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ ok?: boolean; entries?: TransparencyEntryRow[] }>('/admin/transparency');
      if (res.data.ok) {
        setEntries(res.data.entries ?? []);
      }
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao carregar registros de transparência');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  return (
    <div className="space-y-6">
      {/* ── Top Header ─────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-white">Transparência do Projeto</h1>
            <a
              href="/transparency"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary hover:bg-primary/20 transition"
            >
              Ver Portal Público
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Gestão de despesas, receitas, carteiras rastreadas da tesouraria e lucros de mineração física.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadEntries()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200 hover:text-white hover:bg-slate-700 transition disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </header>

      {/* ── Sistema de Abas ────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-4">
        <button
          type="button"
          onClick={() => setActiveTab('entries')}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition ${
            activeTab === 'entries'
              ? 'bg-primary text-slate-950 shadow-lg shadow-primary/20'
              : 'border border-white/5 bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800/80'
          }`}
        >
          <Receipt className="w-4 h-4" />
          Balanço (Receitas & Despesas)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('wallets')}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition ${
            activeTab === 'wallets'
              ? 'bg-primary text-slate-950 shadow-lg shadow-primary/20'
              : 'border border-white/5 bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800/80'
          }`}
        >
          <Wallet className="w-4 h-4" />
          Carteiras da Tesouraria
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('hardware')}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition ${
            activeTab === 'hardware'
              ? 'bg-primary text-slate-950 shadow-lg shadow-primary/20'
              : 'border border-white/5 bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800/80'
          }`}
        >
          <Cpu className="w-4 h-4" />
          Mineração Física (ASIC)
        </button>
      </div>

      {/* ── Conteúdo da Aba Ativa ───────────────────────────────────────── */}
      {activeTab === 'entries' && (
        <TransparencyEntriesTab
          entries={entries}
          loading={loading}
          onRefresh={loadEntries}
        />
      )}

      {activeTab === 'wallets' && <TrackedWalletsTab />}

      {activeTab === 'hardware' && <HardwareAssetsTab />}
    </div>
  );
}
