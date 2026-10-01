import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ChevronLeft,
  Loader2,
  User as UserIcon,
  Mail,
  Calendar,
  Wallet,
  Globe,
  Ban,
  ShieldCheck,
  ShieldAlert,
  Unlock,
  KeyRound,
  Coins,
  Cpu,
  RefreshCw,
  Plus,
  Send,
  ExternalLink,
  Copy,
  Check,
  X,
  History,
  MessageSquare,
  AlertTriangle,
  RotateCcw,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { adminUsersApi } from './adminUsers.api';
import type {
  AdminBalanceCurrency,
  AdminUserDetailsPayload,
  MinerCatalogRow,
} from './adminUsers.types';

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const userId = Number(id);

  const [data, setData] = useState<AdminUserDetailsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'balances' | 'machines' | 'related' | 'tickets' | 'audit'>('balances');

  // Modals state
  const [balanceModalOpen, setBalanceModalOpen] = useState(false);
  const [balanceCurrency, setBalanceCurrency] = useState<AdminBalanceCurrency>('pol');
  const [balanceMode, setBalanceMode] = useState<'set' | 'add'>('add');
  const [balanceAmount, setBalanceAmount] = useState('');
  const [balanceReason, setBalanceReason] = useState('');
  const [adjustingBalance, setAdjustingBalance] = useState(false);

  const [banModalOpen, setBanModalOpen] = useState(false);
  const [banReason, setBanReason] = useState('');
  const [banDays, setBanDays] = useState('');
  const [banning, setBanning] = useState(false);

  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [resettingPw, setResettingPw] = useState(false);

  const [minerModalOpen, setMinerModalOpen] = useState(false);
  const [minersCatalog, setMinersCatalog] = useState<MinerCatalogRow[]>([]);
  const [selectedMinerId, setSelectedMinerId] = useState<number | null>(null);
  const [minerQuantity, setMinerQuantity] = useState('1');
  const [grantingMiner, setGrantingMiner] = useState(false);

  const [unlocking, setUnlocking] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Tab data loading
  const [relatedAccounts, setRelatedAccounts] = useState<any[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [tickets, setTickets] = useState<any[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);

  const loadUser = useCallback(async () => {
    if (!userId || Number.isNaN(userId)) return;
    setLoading(true);
    try {
      const res = await adminUsersApi.getUserDetail(userId);
      if (res.data.ok) {
        setData(res.data);
      }
    } catch {
      toast.error('Erro ao carregar detalhes do usuário.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  // Load related accounts when tab is opened
  useEffect(() => {
    if (activeTab === 'related' && userId && relatedAccounts.length === 0) {
      setLoadingRelated(true);
      void adminUsersApi.getRelatedUsers(userId).then((res) => {
        if (res.data.ok) setRelatedAccounts(res.data.related ?? []);
      }).catch(() => {}).finally(() => setLoadingRelated(false));
    }

    if (activeTab === 'tickets' && userId && tickets.length === 0) {
      setLoadingTickets(true);
      void adminUsersApi.getUserTickets(userId).then((res) => {
        if (res.data.ok) setTickets(res.data.tickets ?? []);
      }).catch(() => {}).finally(() => setLoadingTickets(false));
    }
  }, [activeTab, userId, relatedAccounts.length, tickets.length]);

  const copyToClipboard = (text: string, key: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success('Copiado para a área de transferência!');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleAdjustBalance = async () => {
    const amount = Number(balanceAmount.replace(',', '.'));
    if (!Number.isFinite(amount)) {
      toast.error('Informe um valor numérico válido.');
      return;
    }
    setAdjustingBalance(true);
    try {
      const res = await adminUsersApi.adjustBalance(userId, {
        currency: balanceCurrency,
        mode: balanceMode,
        amount,
        reason: balanceReason.trim() || undefined,
      });
      if (res.data.ok) {
        toast.success(`Saldo de ${balanceCurrency.toUpperCase()} ajustado! Novo saldo: ${res.data.next}`);
        setBalanceModalOpen(false);
        setBalanceAmount('');
        setBalanceReason('');
        void loadUser();
      }
    } catch {
      toast.error('Falha ao ajustar saldo.');
    } finally {
      setAdjustingBalance(false);
    }
  };

  const handleBanToggle = async () => {
    if (!data?.user) return;
    setBanning(true);
    try {
      if (data.user.isBanned) {
        const res = await adminUsersApi.unbanUser(userId, banReason.trim() || undefined);
        if (res.data.ok) {
          toast.success('Usuário desbanido com sucesso!');
          setBanModalOpen(false);
          setBanReason('');
          void loadUser();
        }
      } else {
        const days = banDays ? parseInt(banDays, 10) : undefined;
        const res = await adminUsersApi.banUser(userId, {
          reason: banReason.trim() || 'Admin ban',
          days: Number.isFinite(days) && (days ?? 0) > 0 ? days : undefined,
        });
        if (res.data.ok) {
          toast.success('Usuário banido com sucesso!');
          setBanModalOpen(false);
          setBanReason('');
          setBanDays('');
          void loadUser();
        }
      }
    } catch {
      toast.error('Erro ao atualizar status de banimento.');
    } finally {
      setBanning(false);
    }
  };

  const handleUnlockUser = async () => {
    setUnlocking(true);
    try {
      const res = await adminUsersApi.unlockUser(userId);
      if (res.data.ok) {
        toast.success(res.data.message || 'Bloqueio de segurança removido!');
        void loadUser();
      }
    } catch {
      toast.error('Erro ao desbloquear usuário.');
    } finally {
      setUnlocking(false);
    }
  };

  const handleResetPassword = async () => {
    setResettingPw(true);
    try {
      const res = await adminUsersApi.resetPassword(userId, {
        newPassword: newPassword.trim() || undefined,
      });
      if (res.data.ok) {
        if (res.data.generatedPassword) {
          toast.success(`Senha gerada: ${res.data.generatedPassword}`, { duration: 10000 });
        } else {
          toast.success('Senha redefinida com sucesso!');
        }
        setPwModalOpen(false);
        setNewPassword('');
      }
    } catch {
      toast.error('Erro ao redefinir senha.');
    } finally {
      setResettingPw(false);
    }
  };

  const handleOpenMinerModal = async () => {
    setMinerModalOpen(true);
    if (minersCatalog.length === 0) {
      try {
        const res = await adminUsersApi.fetchCatalogMiners();
        if (res.data.ok) {
          const list = res.data.miners ?? [];
          setMinersCatalog(list);
          if (list.length > 0) setSelectedMinerId(Number(list[0].id));
        }
      } catch {
        toast.error('Erro ao carregar catálogo de mineradoras.');
      }
    }
  };

  const handleSendMiner = async () => {
    if (!selectedMinerId) {
      toast.error('Selecione uma mineradora.');
      return;
    }
    const qty = parseInt(minerQuantity, 10);
    if (!Number.isFinite(qty) || qty < 1 || qty > 50) {
      toast.error('Quantidade deve ser entre 1 e 50.');
      return;
    }
    setGrantingMiner(true);
    try {
      const res = await adminUsersApi.sendMiner(userId, {
        minerId: selectedMinerId,
        quantity: qty,
      });
      if (res.data.ok) {
        toast.success(res.data.message || 'Mineradora concedida com sucesso!');
        setMinerModalOpen(false);
        void loadUser();
      }
    } catch {
      toast.error('Erro ao conceder mineradora.');
    } finally {
      setGrantingMiner(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin mb-3" />
        <p className="text-xs font-bold">Carregando perfil do jogador...</p>
      </div>
    );
  }

  if (!data?.user) {
    return (
      <div className="p-8 text-center space-y-4">
        <h2 className="text-xl font-bold text-white">Usuário não encontrado</h2>
        <Link to="/admin/users" className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400">
          <ChevronLeft className="w-4 h-4" />
          Voltar para a Lista de Usuários
        </Link>
      </div>
    );
  }

  const { user, metrics } = data;
  const displayName = user.username ?? user.name ?? `Jogador #${user.id}`;
  const isBanned = Boolean(user.isBanned);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* ─── Back Link ──────────────────────────────────────────────── */}
      <div>
        <Link
          to="/admin/users"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Voltar para a Lista de Usuários
        </Link>
      </div>

      {/* ─── Profile Header Card ────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-5 flex-wrap">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 font-black text-2xl shadow-xl shrink-0 mt-0.5">
              {displayName[0]?.toUpperCase() ?? 'U'}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl font-black text-white tracking-tight">{displayName}</h1>
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                  ID #{user.id}
                </span>

                {isBanned ? (
                  <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/40 flex items-center gap-1">
                    <Ban className="w-3 h-3" /> Banido
                  </span>
                ) : (
                  <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> Ativo
                  </span>
                )}

                {user.refCode && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    Ref: {user.refCode}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-500" />
                  {user.email}
                </span>
                <span className="flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-slate-500" />
                  IP Cadastro: <strong className="text-slate-300 font-mono">{user.registrationIp || '—'}</strong>
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  Cadastro: {user.createdAt ? new Date(user.createdAt).toLocaleDateString('pt-BR') : '—'}
                </span>
              </div>

              {isBanned && user.banReason && (
                <p className="text-xs text-red-400/90 italic pt-1">
                  Motivo do banimento: &ldquo;{user.banReason}&rdquo;
                  {user.bannedUntil && ` (até ${new Date(user.bannedUntil).toLocaleDateString('pt-BR')})`}
                </p>
              )}
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setBalanceModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition-all shadow-sm"
            >
              <Coins className="w-3.5 h-3.5" />
              <span>Ajustar Saldo</span>
            </button>

            <button
              type="button"
              onClick={handleOpenMinerModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 transition-all shadow-sm"
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Enviar Máquina</span>
            </button>

            <button
              type="button"
              onClick={() => setBanModalOpen(true)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
                isBanned
                  ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30'
                  : 'bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30'
              }`}
            >
              <Ban className="w-3.5 h-3.5" />
              <span>{isBanned ? 'Desbanir' : 'Banir'}</span>
            </button>

            <button
              type="button"
              onClick={() => setPwModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all shadow-sm"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Resetar Senha</span>
            </button>

            <button
              type="button"
              onClick={handleUnlockUser}
              disabled={unlocking}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all shadow-sm disabled:opacity-50"
              title="Remover restrição de segurança (SEC_LOCK)"
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>{unlocking ? 'Desbloqueando...' : 'Desbloquear'}</span>
            </button>
          </div>
        </div>

        {/* ─── Metric KPIs Grid ──────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6 pt-6 border-t border-slate-800/80">
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Hashrate Ativo</span>
            <div className="text-xl font-black text-amber-400 mt-1">{metrics?.realHashRate ?? 0} TH/s</div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Máquinas Racks</span>
            <div className="text-xl font-black text-sky-400 mt-1">{metrics?.activeMachines ?? 0}</div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Faucet Claims</span>
            <div className="text-xl font-black text-purple-400 mt-1">{metrics?.faucetClaims ?? 0}</div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Total Depositado</span>
            <div className="text-xl font-black text-emerald-400 mt-1">{Number(metrics?.totalDeposited ?? 0).toFixed(4)} POL</div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Total Sacado</span>
            <div className="text-xl font-black text-slate-300 mt-1">{Number(metrics?.totalWithdrawn ?? 0).toFixed(4)} POL</div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Transações</span>
            <div className="text-xl font-black text-slate-300 mt-1">{metrics?.totalTransactions ?? 0}</div>
          </div>
        </div>
      </div>

      {/* ─── Tabs Navigation ────────────────────────────────────────── */}
      <div className="border-b border-slate-800">
        <nav className="flex gap-2 -mb-px overflow-x-auto text-xs font-bold scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab('balances')}
            className={`inline-flex items-center gap-2 px-4 py-3 border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'balances'
                ? 'border-amber-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Coins className="w-3.5 h-3.5 text-amber-400" />
            Balanços &amp; Carteiras
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('machines')}
            className={`inline-flex items-center gap-2 px-4 py-3 border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'machines'
                ? 'border-amber-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5 text-purple-400" />
            Máquinas ({user._count?.miners ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('related')}
            className={`inline-flex items-center gap-2 px-4 py-3 border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'related'
                ? 'border-amber-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-sky-400" />
            Contas Relacionadas
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tickets')}
            className={`inline-flex items-center gap-2 px-4 py-3 border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'tickets'
                ? 'border-amber-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
            Tickets de Suporte ({metrics?.totalTickets ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`inline-flex items-center gap-2 px-4 py-3 border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'audit'
                ? 'border-amber-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-3.5 h-3.5 text-slate-400" />
            Auditoria ({user._count?.auditLogs ?? 0})
          </button>
        </nav>
      </div>

      {/* ─── Tab Content Panels ─────────────────────────────────────── */}
      <div>
        {/* TAB 1: BALANCES */}
        {activeTab === 'balances' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {[
                { label: 'Polygon (POL)', value: user.polBalance, symbol: 'POL', primary: true },
                { label: 'BlockToken (BLK)', value: user.blkBalance, symbol: 'BLK', primary: true },
                { label: 'BLK Bloqueado', value: user.blkLocked, symbol: 'BLK' },
                { label: 'Shiba Inu (SHIB)', value: user.shibBalance, symbol: 'SHIB' },
                { label: 'Bitcoin (BTC)', value: user.btcBalance, symbol: 'BTC' },
                { label: 'Ethereum (ETH)', value: user.ethBalance, symbol: 'ETH' },
                { label: 'Tether (USDT)', value: user.usdtBalance, symbol: 'USDT' },
                { label: 'USD Coin (USDC)', value: user.usdcBalance, symbol: 'USDC' },
                { label: 'Zerads (ZER)', value: user.zerBalance, symbol: 'ZER' },
              ].map((b) => (
                <div key={b.label} className="p-4 rounded-2xl border border-slate-800 bg-slate-900/50 backdrop-blur-sm">
                  <div className="flex items-center justify-between text-xs text-slate-400 font-bold">
                    <span>{b.label}</span>
                    <span className="font-mono text-[10px] text-slate-500">{b.symbol}</span>
                  </div>
                  <div className="text-xl font-black text-white font-mono mt-2">
                    {Number(b.value ?? 0).toFixed(6)}
                  </div>
                </div>
              ))}
            </div>

            {/* Wallets & Addresses */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Wallet className="w-4 h-4 text-emerald-400" />
                Carteiras Vinculadas
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Carteira Pública EVM</span>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-slate-300 truncate">{user.walletAddress || 'Não configurada'}</span>
                    {user.walletAddress && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard(user.walletAddress!, 'evm')}
                        className="text-slate-400 hover:text-white shrink-0"
                      >
                        {copiedKey === 'evm' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Endereço HD Polygon (Depósito)</span>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-slate-300 truncate">{user.polygonHdAddress?.address || 'Não derivado'}</span>
                    {user.polygonHdAddress?.address && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard(user.polygonHdAddress!.address!, 'hd')}
                        className="text-slate-400 hover:text-white shrink-0"
                      >
                        {copiedKey === 'hd' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: MACHINES */}
        {activeTab === 'machines' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Máquinas Instaladas nos Racks ({user.miners?.length ?? 0})</h3>
            </div>
            {(!user.miners || user.miners.length === 0) ? (
              <div className="p-8 text-center rounded-2xl border border-slate-800 bg-slate-900/30 text-slate-500">
                Nenhuma máquina instalada nos racks.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {user.miners.map((m) => (
                  <div key={m.id} className="p-4 rounded-2xl border border-slate-800 bg-slate-900/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-xs truncate">{m.miner?.name ?? `Mineradora #${m.minerId}`}</span>
                      <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-800 text-amber-300">
                        {m.hashRate} TH/s
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>Nível: {m.level}</span>
                      <span>Slot #{m.slotIndex}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: RELATED USERS */}
        {activeTab === 'related' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-white">Contas com Conexão de IP, Carteira ou Dispositivo</h3>
            {loadingRelated ? (
              <div className="py-12 text-center text-slate-500"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />Buscando colisões...</div>
            ) : relatedAccounts.length === 0 ? (
              <div className="p-8 text-center rounded-2xl border border-slate-800 bg-slate-900/30 text-slate-500">
                Nenhuma conta relacionada identificada para este usuário.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="p-3">ID</th>
                      <th className="p-3">Usuário</th>
                      <th className="p-3">E-mail</th>
                      <th className="p-3">Motivo da Conexão</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {relatedAccounts.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-800/30">
                        <td className="p-3 font-mono text-slate-400">#{r.id}</td>
                        <td className="p-3 font-bold text-white">{r.username ?? r.name ?? '—'}</td>
                        <td className="p-3 text-slate-300 font-mono text-[11px]">{r.email}</td>
                        <td className="p-3">
                          <span className="inline-flex gap-1">
                            {r.reasons?.map((reason: string) => (
                              <span key={reason} className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-bold text-amber-300 uppercase">
                                {reason}
                              </span>
                            ))}
                          </span>
                        </td>
                        <td className="p-3">
                          {r.isBanned ? (
                            <span className="text-red-400 text-[10px] font-bold">Banido</span>
                          ) : (
                            <span className="text-emerald-400 text-[10px] font-bold">Ativo</span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <Link to={`/admin/users/${r.id}`} className="text-amber-400 hover:text-amber-300 font-bold">
                            Ver Perfil
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: TICKETS */}
        {activeTab === 'tickets' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-white">Chamados de Suporte Registrados</h3>
            {loadingTickets ? (
              <div className="py-12 text-center text-slate-500"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />Carregando chamados...</div>
            ) : tickets.length === 0 ? (
              <div className="p-8 text-center rounded-2xl border border-slate-800 bg-slate-900/30 text-slate-500">
                Nenhum chamado de suporte aberto por este usuário.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="p-3">Protocolo</th>
                      <th className="p-3">Assunto</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Respostas</th>
                      <th className="p-3 text-right">Aberto em</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {tickets.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-800/30">
                        <td className="p-3 font-mono text-slate-400">#{t.id}</td>
                        <td className="p-3 font-bold text-white">{t.subject}</td>
                        <td className="p-3">
                          {t.isReplied ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                              Respondido
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
                              Pendente
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-mono">{t._count?.replies ?? 0}</td>
                        <td className="p-3 font-mono text-right text-slate-400">
                          {new Date(t.createdAt).toLocaleString('pt-BR')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 5: AUDIT LOGS */}
        {activeTab === 'audit' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-white">Últimos Registros de Auditoria ({user.auditLogs?.length ?? 0})</h3>
            {(!user.auditLogs || user.auditLogs.length === 0) ? (
              <div className="p-8 text-center rounded-2xl border border-slate-800 bg-slate-900/30 text-slate-500">
                Nenhum log de auditoria recente.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="p-3">Ação</th>
                      <th className="p-3">Rótulo / Descrição</th>
                      <th className="p-3">Severidade</th>
                      <th className="p-3">IP</th>
                      <th className="p-3 text-right">Data</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {user.auditLogs.map((log: any) => (
                      <tr key={log.id} className="hover:bg-slate-800/30">
                        <td className="p-3 font-mono font-bold text-white">{log.action}</td>
                        <td className="p-3 text-slate-300">
                          {log.label && <strong>{log.label} — </strong>}
                          {log.description ?? '—'}
                        </td>
                        <td className="p-3">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                            log.severity === 'warn' ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-400'
                          }`}>
                            {log.severity}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-[11px] text-slate-400">{log.ip ?? '—'}</td>
                        <td className="p-3 font-mono text-slate-400 text-right whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString('pt-BR')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── MODAL 1: ADJUST BALANCE ────────────────────────────────── */}
      {balanceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Coins className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">Ajustar Saldo Financeiro</h3>
              </div>
              <button type="button" onClick={() => setBalanceModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 font-bold uppercase text-[10px]">Moeda:</label>
                <select
                  value={balanceCurrency}
                  onChange={(e) => setBalanceCurrency(e.target.value as AdminBalanceCurrency)}
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                >
                  <option value="pol">POL (Polygon)</option>
                  <option value="blk">BLK (BlockToken)</option>
                  <option value="blkLocked">BLK Bloqueado</option>
                  <option value="shib">SHIB (Shiba Inu)</option>
                  <option value="btc">BTC (Bitcoin)</option>
                  <option value="eth">ETH (Ethereum)</option>
                  <option value="usdt">USDT</option>
                  <option value="usdc">USDC</option>
                  <option value="zer">ZER (Zerads)</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 font-bold uppercase text-[10px]">Modo de Operação:</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setBalanceMode('add')}
                    className={`p-2.5 rounded-xl font-bold border transition-colors ${
                      balanceMode === 'add' ? 'bg-amber-500/20 border-amber-500 text-amber-300' : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    Adicionar (+ / -)
                  </button>
                  <button
                    type="button"
                    onClick={() => setBalanceMode('set')}
                    className={`p-2.5 rounded-xl font-bold border transition-colors ${
                      balanceMode === 'set' ? 'bg-amber-500/20 border-amber-500 text-amber-300' : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    Definir Exato
                  </button>
                </div>
              </div>

              <div>
                <label className="text-slate-400 font-bold uppercase text-[10px]">Valor:</label>
                <input
                  type="text"
                  placeholder="0.000000"
                  value={balanceAmount}
                  onChange={(e) => setBalanceAmount(e.target.value)}
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono"
                />
              </div>

              <div>
                <label className="text-slate-400 font-bold uppercase text-[10px]">Motivo do Ajuste:</label>
                <input
                  type="text"
                  placeholder="Ex.: Compensação por instabilidade / bônus"
                  value={balanceReason}
                  onChange={(e) => setBalanceReason(e.target.value)}
                  maxLength={300}
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setBalanceModalOpen(false)}
                disabled={adjustingBalance}
                className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 text-xs font-bold text-slate-300 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAdjustBalance}
                disabled={adjustingBalance || !balanceAmount.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-amber-500 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black uppercase tracking-wider transition-all disabled:opacity-40"
              >
                {adjustingBalance ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Coins className="w-3.5 h-3.5" />}
                Confirmar Ajuste
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 2: BAN USER ──────────────────────────────────────── */}
      {banModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Ban className="w-5 h-5 text-red-400" />
                <h3 className="text-base font-bold text-white">
                  {isBanned ? 'Desbanir Usuário' : 'Banir Usuário'}
                </h3>
              </div>
              <button type="button" onClick={() => setBanModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              {isBanned
                ? 'O usuário voltará a ter acesso normal aos jogos, saques e plataforma.'
                : 'O usuário será imediatamente impedido de efetuar login, jogar e sacar.'}
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 font-bold uppercase text-[10px]">Motivo:</label>
                <input
                  type="text"
                  placeholder="Ex.: Uso de automação / script não autorizado"
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  maxLength={300}
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                />
              </div>

              {!isBanned && (
                <div>
                  <label className="text-slate-400 font-bold uppercase text-[10px]">
                    Duração em Dias (vazio = permanente):
                  </label>
                  <input
                    type="number"
                    placeholder="Ex.: 7, 30..."
                    value={banDays}
                    onChange={(e) => setBanDays(e.target.value)}
                    min={1}
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setBanModalOpen(false)}
                disabled={banning}
                className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 text-xs font-bold text-slate-300 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleBanToggle}
                disabled={banning}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-lg transition-all ${
                  isBanned ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'
                }`}
              >
                {banning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                {isBanned ? 'Confirmar Desbanimento' : 'Confirmar Banimento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 3: RESET PASSWORD ────────────────────────────────── */}
      {pwModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">Redefinir Senha do Usuário</h3>
              </div>
              <button type="button" onClick={() => setPwModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <label className="text-slate-400 font-bold uppercase text-[10px]">
                Nova Senha (deixe em branco para gerar aleatória):
              </label>
              <input
                type="text"
                placeholder="Gerar automaticamente ou digitar..."
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono"
              />
              <p className="text-[11px] text-slate-500">
                Se deixar em branco, uma senha forte e segura será gerada e exibida na tela.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPwModalOpen(false)}
                disabled={resettingPw}
                className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 text-xs font-bold text-slate-300 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleResetPassword}
                disabled={resettingPw}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black uppercase tracking-wider transition-all"
              >
                {resettingPw ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                Salvar Nova Senha
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 4: SEND MINER ────────────────────────────────────── */}
      {minerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-purple-500/30 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-purple-400" />
                <h3 className="text-base font-bold text-white">Conceder Mineradora ao Inventário</h3>
              </div>
              <button type="button" onClick={() => setMinerModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 font-bold uppercase text-[10px]">Modelo da Mineradora:</label>
                <select
                  value={selectedMinerId ?? ''}
                  onChange={(e) => setSelectedMinerId(Number(e.target.value))}
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                >
                  {minersCatalog.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.baseHashRate} TH/s)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-400 font-bold uppercase text-[10px]">Quantidade (1-50):</label>
                <input
                  type="number"
                  value={minerQuantity}
                  onChange={(e) => setMinerQuantity(e.target.value)}
                  min={1}
                  max={50}
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setMinerModalOpen(false)}
                disabled={grantingMiner}
                className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 text-xs font-bold text-slate-300 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSendMiner}
                disabled={grantingMiner}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-lg shadow-purple-600/20 disabled:opacity-50"
              >
                {grantingMiner ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Conceder Máquina
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
