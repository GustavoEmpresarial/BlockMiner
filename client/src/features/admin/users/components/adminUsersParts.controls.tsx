import { useState, useEffect, useRef, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from 'react';
import { toast } from 'sonner';
import {
  Activity, Ban, ChevronLeft, ChevronRight, Copy, Cpu, ExternalLink, Eye, EyeOff,
  Fingerprint, KeyRound, Loader2, Minus, Package, Plus, RefreshCw, Search, Send,
  ShieldCheck, Terminal, UserRound, Wallet, X,
} from 'lucide-react';
import { api } from '../../../../shared/auth/auth.store';
import { readAxiosResponseMessage } from '../../lib/admin.api';
import AntibotTab from '../AntibotTab';
import type {
    LucideIc,
    IpIntel,
    AdminUsersListRow,
    PolygonHd,
    AdminDossierUser,
    AdminDossierMetrics,
    AdminUserDetailsPayload,
    UsersListApiResponse,
    MinerCatalogRow,
    MinersCatalogResponse,
    TransactionRow,
    LogRow,
    TicketRow,
    MachineRow,
    RelatedUserRow,
    RelatedUserWithRel,
    ReferralRow,
    RelatedDataPayload,
    TabData,
    AdminUsersTabSlice,
    TabStateMap,
} from '../adminUsers.types';


export const FILTERS: [string, string][] = [
  ['all', 'Todos'],
  ['active', 'Ativos'],
  ['banned', 'Banidos'],
  ['with_balance', 'Com saldo'],
  ['with_active_machines', 'Máquinas ativas'],
  ['wallet_linked', 'Com wallet'],
  ['wallet_missing', 'Sem wallet'],
  ['with_deposits', 'Depósitos'],
  ['with_withdrawals', 'Saques'],
  ['with_faucet', 'Faucet'],
  ['shared_ip', 'IP compartilhado'],
  ['suspected', 'Suspeitos'],
  ['asn_provider', 'ASN/provider'],
  ['today', 'Hoje'],
  ['7d', '7 dias'],
  ['30d', '30 dias'],
  ['show_qa', 'Contas QA (teste)'],
];

export const SORTS: [string, string][] = [
  ['recent_id', 'ID recente'],
  ['oldest_id', 'ID antigo'],
  ['highest_balance', 'Maior saldo'],
  ['highest_hashrate', 'Maior poder'],
  ['last_login', 'Último login'],
  ['created_recent', 'Cadastro recente'],
  ['transaction_count', 'Mais transações'],
  ['log_count', 'Mais logs'],
  ['risk', 'Risco'],
];

export function isEvm(value: unknown): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());
}

export function CopyButton({ value, title = 'Copiar' }: { value: string | number | null | undefined; title?: string }) {
  if (value == null || value === '') return null;
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard.writeText(String(value));
        toast.success('Copiado');
      }}
      className="p-1 text-slate-500 hover:text-emerald-400"
    >
      <Copy className="h-3.5 w-3.5" />
    </button>
  );
}

export function ExplorerLink({ value }: { value: unknown }) {
  if (!isEvm(value)) return null;
  return (
    <a
      href={`https://polygonscan.com/address/${encodeURIComponent(String(value).trim())}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="p-1 text-sky-500 hover:text-sky-400"
      title="Polygonscan"
    >
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}

export function TxHashLink({ hash }: { hash: string | null | undefined }) {
  if (!hash) return <span className="text-slate-600">--</span>;
  return (
    <span className="inline-flex max-w-[220px] items-center gap-1">
      <span className="truncate font-mono text-slate-300">{hash}</span>
      <CopyButton value={hash} title="Copiar hash" />
      <a href={`https://polygonscan.com/tx/${encodeURIComponent(hash)}`} target="_blank" rel="noopener noreferrer" className="text-sky-500 hover:text-sky-400">
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </span>
  );
}

export function MetaBlock({ value }: { value: unknown }) {
  const [open, setOpen] = useState(false);
  if (value == null || value === '') return <span className="text-slate-600">--</span>;
  const text = JSON.stringify(value);
  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)} className="text-[10px] font-black uppercase text-slate-400 hover:text-white">
        {open ? 'Ocultar metadata' : 'Ver metadata'}
      </button>
      {open ? <pre className="mt-2 max-h-48 overflow-auto rounded-xl bg-slate-950 p-3 text-[10px] text-slate-300">{text}</pre> : null}
    </div>
  );
}

export function ResetPasswordModal({ userId, onClose }: { userId: number; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.trim().length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    try {
      setSaving(true);
      const res = await api.post<{ ok: boolean; message?: string }>(`/admin/users/${userId}/reset-password`, { newPassword: password.trim() });
      if (res.data.ok) {
        toast.success('Senha redefinida com sucesso!');
        onClose();
      } else {
        toast.error(res.data.message || 'Erro ao redefinir senha.');
      }
    } catch (err: unknown) {
      toast.error(readAxiosResponseMessage(err) || 'Erro ao redefinir senha.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl border border-amber-500/20 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-black text-white uppercase tracking-widest">Redefinir senha</h3>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-500 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="relative">
            <input
              ref={inputRef}
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nova senha (mín. 6 caracteres)"
              autoComplete="new-password"
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 pr-10 text-sm text-white placeholder-slate-500 focus:border-amber-500/50 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
            >
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-[10px] text-slate-500">A senha atual do usuário deixará de funcionar imediatamente.</p>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving || password.trim().length < 6}
              className="flex-1 rounded-xl py-3 text-sm font-black uppercase tracking-widest bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 disabled:opacity-40"
            >
              {saving ? 'Salvando...' : 'Salvar senha'}
            </button>
            <button type="button" onClick={onClose} className="rounded-xl px-4 py-3 text-sm font-bold text-slate-500 hover:text-white bg-slate-800">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function Badge({ text, color = 'slate' }: { text: string; color?: 'slate' | 'red' | 'amber' | 'emerald' }) {
  const cls =
    color === 'red'
      ? 'bg-red-500/10 text-red-300'
      : color === 'amber'
        ? 'bg-amber-500/10 text-amber-300'
        : color === 'emerald'
          ? 'bg-emerald-500/10 text-emerald-300'
          : 'bg-slate-800 text-slate-400';
  return <span className={`rounded-lg px-2 py-1 text-[9px] font-black uppercase ${cls}`}>{text}</span>;
}

export function DetailCard({
  label,
  value,
  icon: Icon,
  color = 'slate',
  mono = false,
  children,
}: {
  label: string;
  value: ReactNode;
  icon: LucideIc;
  color?: 'slate' | 'amber' | 'emerald' | 'red';
  mono?: boolean;
  children?: ReactNode;
}) {
  const display = value !== null && value !== undefined && value !== '' ? value : '--';
  const c =
    color === 'amber' ? 'text-amber-400' : color === 'emerald' ? 'text-emerald-400' : color === 'red' ? 'text-red-400' : 'text-slate-200';
  return (
    <div className="rounded-2xl border border-slate-800 p-4">
      <div className="mb-2 flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-500">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className={`break-all text-sm font-bold ${c} ${mono ? 'font-mono text-xs' : ''}`}>
        {display} {children}
      </div>
    </div>
  );
}

