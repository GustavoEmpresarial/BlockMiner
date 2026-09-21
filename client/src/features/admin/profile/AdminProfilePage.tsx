import React, { useState, useEffect, useCallback } from 'react';
import {
  User,
  Shield,
  KeyRound,
  Monitor,
  Smartphone,
  Laptop,
  Globe,
  Trash2,
  LogOut,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Eye,
  EyeOff,
  Edit3,
  Clock,
  Activity,
  Calendar,
  Lock,
  Check,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Fingerprint,
  Mail,
  ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getAdminProfile,
  updateAdminProfile,
  changeAdminOwnPassword,
  getAdminSessions,
  revokeAdminSession,
  revokeOtherAdminSessions,
  getMyAdminAuditLogs,
} from '../lib/admin.api';
import type {
  AdminProfileUser,
  AdminSessionItem,
  AdminAuditLogRow,
} from '../lib/admin.types';

type ActiveTab = 'overview' | 'security' | 'sessions' | 'activity';

interface ParsedUa {
  browser: string;
  os: string;
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown';
}

function parseUserAgent(ua: string | null): ParsedUa {
  if (!ua) return { browser: 'Navegador Desconhecido', os: 'SO Desconhecido', deviceType: 'desktop' };

  let os = 'SO Desconhecido';
  if (/windows/i.test(ua)) os = 'Windows';
  else if (/macintosh|mac os x/i.test(ua)) os = 'macOS';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
  else if (/linux/i.test(ua)) os = 'Linux';

  let browser = 'Navegador';
  if (/edg/i.test(ua)) browser = 'Microsoft Edge';
  else if (/opr|opera/i.test(ua)) browser = 'Opera';
  else if (/chrome|crios/i.test(ua)) browser = 'Google Chrome';
  else if (/firefox|fxios/i.test(ua)) browser = 'Mozilla Firefox';
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Apple Safari';

  let deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown' = 'desktop';
  if (/ipad|tablet/i.test(ua)) deviceType = 'tablet';
  else if (/mobile|iphone|android/i.test(ua)) deviceType = 'mobile';

  return { browser, os, deviceType };
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'Agora mesmo';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `Há ${diffMin} min`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `Há ${diffHour}h`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 30) return `Há ${diffDay} dias`;
    return formatDate(iso);
  } catch {
    return String(iso);
  }
}

function getRoleBadge(role: string) {
  switch (role?.toLowerCase()) {
    case 'super_admin':
      return {
        label: 'Super Administrador',
        bgColor: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        icon: ShieldAlert,
      };
    case 'admin':
      return {
        label: 'Administrador',
        bgColor: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        icon: Shield,
      };
    default:
      return {
        label: role ? role.toUpperCase() : 'Moderador',
        bgColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        icon: ShieldCheckIcon,
      };
  }
}

function ShieldCheckIcon(props: { className?: string }) {
  return <Shield className={props.className} />;
}

export default function AdminProfilePage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [admin, setAdmin] = useState<AdminProfileUser | null>(null);
  const [activeSessionsCount, setActiveSessionsCount] = useState<number>(1);
  const [totalAuditCount, setTotalAuditCount] = useState<number>(0);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<AdminSessionItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLogRow[]>([]);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotalPages, setAuditTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Edit Name Modal State
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameLoading, setNameLoading] = useState(false);

  // Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Revoke All Others Modal
  const [showRevokeOthersModal, setShowRevokeOthersModal] = useState(false);
  const [revokingOthers, setRevokingOthers] = useState(false);

  // Single Session Revoke Modal
  const [sessionToRevoke, setSessionToRevoke] = useState<string | null>(null);
  const [revokingSingle, setRevokingSingle] = useState(false);

  const loadData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);

    try {
      const [profileRes, sessionsRes, auditRes] = await Promise.all([
        getAdminProfile().catch(() => null),
        getAdminSessions().catch(() => null),
        getMyAdminAuditLogs({ page: 1, pageSize: 10 }).catch(() => null),
      ]);

      if (profileRes?.data?.ok) {
        setAdmin(profileRes.data.admin);
        setNameInput(profileRes.data.admin.name || '');
        setActiveSessionsCount(profileRes.data.activeSessionsCount || 1);
        setTotalAuditCount(profileRes.data.totalAuditCount || 0);
        if (profileRes.data.currentSessionId) {
          setCurrentSessionId(profileRes.data.currentSessionId);
        }
      }

      if (sessionsRes?.data?.ok) {
        setSessions(sessionsRes.data.sessions || []);
        if (sessionsRes.data.currentSessionId) {
          setCurrentSessionId(sessionsRes.data.currentSessionId);
        }
      }

      if (auditRes?.data?.ok) {
        setAuditLogs(auditRes.data.rows || []);
        setAuditTotalPages(auditRes.data.totalPages || 1);
        setAuditPage(1);
      }
    } catch {
      toast.error('Erro ao carregar dados do perfil administrativo.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const loadAuditPage = async (page: number) => {
    try {
      const res = await getMyAdminAuditLogs({ page, pageSize: 10 });
      if (res.data?.ok) {
        setAuditLogs(res.data.rows || []);
        setAuditTotalPages(res.data.totalPages || 1);
        setAuditPage(page);
      }
    } catch {
      toast.error('Não foi possível carregar a página de auditoria.');
    }
  };

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed.length < 2) {
      toast.error('O nome deve ter no mínimo 2 caracteres.');
      return;
    }
    setNameLoading(true);
    try {
      const res = await updateAdminProfile(trimmed);
      if (res.data?.ok) {
        toast.success(res.data.message || 'Nome atualizado com sucesso!');
        setAdmin(res.data.admin);
        setIsEditingName(false);
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Falha ao atualizar nome.';
      toast.error(msg);
    } finally {
      setNameLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword) {
      toast.error('Informe a nova senha.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('As senhas digitadas não coincidem.');
      return;
    }
    if (newPassword.length < 12) {
      toast.error('A nova senha deve ter no mínimo 12 caracteres.');
      return;
    }

    setPasswordLoading(true);
    try {
      const res = await changeAdminOwnPassword({
        currentPassword: currentPassword || undefined,
        newPassword,
      });
      if (res.data?.ok) {
        toast.success(res.data.message || 'Senha alterada com sucesso!');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        void loadData(true);
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Falha ao alterar senha.';
      toast.error(msg);
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleRevokeSingle = async () => {
    if (!sessionToRevoke) return;
    setRevokingSingle(true);
    try {
      const res = await revokeAdminSession(sessionToRevoke);
      if (res.data?.ok) {
        toast.success('Sessão encerrada com sucesso.');
        setSessionToRevoke(null);
        void loadData(true);
      }
    } catch {
      toast.error('Falha ao encerrar a sessão.');
    } finally {
      setRevokingSingle(false);
    }
  };

  const handleRevokeOthers = async () => {
    setRevokingOthers(true);
    try {
      const res = await revokeOtherAdminSessions();
      if (res.data?.ok) {
        toast.success(res.data.message || 'Todas as outras sessões foram desconectadas.');
        setShowRevokeOthersModal(false);
        void loadData(true);
      }
    } catch {
      toast.error('Falha ao revogar outras sessões.');
    } finally {
      setRevokingOthers(false);
    }
  };

  // Password criteria check
  const hasMinLength = newPassword.length >= 12;
  const hasUpper = /[A-Z]/.test(newPassword);
  const hasLower = /[a-z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const hasSymbol = /[^A-Za-z0-9]/.test(newPassword);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  const passedCriteriaCount = [hasMinLength, hasUpper, hasLower, hasNumber, hasSymbol].filter(Boolean).length;
  const strengthPercentage = (passedCriteriaCount / 5) * 100;
  const strengthColor =
    passedCriteriaCount <= 2 ? 'bg-red-500' : passedCriteriaCount <= 4 ? 'bg-amber-500' : 'bg-emerald-500';
  const strengthLabel =
    passedCriteriaCount <= 2 ? 'Fraca' : passedCriteriaCount <= 4 ? 'Boa' : 'Excelente';

  const roleMeta = getRoleBadge(admin?.role || 'admin');
  const RoleIcon = roleMeta.icon;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
        <p className="text-sm text-slate-400">Carregando dados do perfil administrativo...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Top Banner / Admin Identity */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-slate-950/90 p-6 md:p-8 backdrop-blur-xl shadow-2xl">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="relative group">
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-black text-2xl md:text-3xl shadow-lg border-2 border-white/20">
                {admin?.name?.slice(0, 2).toUpperCase() || 'AD'}
              </div>
              <span className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-emerald-500 border-2 border-slate-900" title="Online" />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl md:text-2xl font-black text-white tracking-tight">
                  {admin?.name || 'Administrador'}
                </h1>
                <button
                  onClick={() => setIsEditingName(true)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                  title="Editar Nome"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${roleMeta.bgColor}`}>
                  <RoleIcon className="w-3.5 h-3.5" />
                  <span>{roleMeta.label}</span>
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                <span className="flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-slate-500" />
                  {admin?.email || '—'}
                </span>
                <span className="text-slate-600">•</span>
                <span className="flex items-center gap-1">
                  <Fingerprint className="w-3.5 h-3.5 text-slate-500" />
                  ID #{admin?.id ?? 0}
                </span>
                <span className="text-slate-600">•</span>
                <span className="flex items-center gap-1 text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Conta Ativa
                </span>
              </div>
            </div>
          </div>

          {/* Quick Refresh Button */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => void loadData(true)}
              disabled={refreshing}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-400' : ''}`} />
              <span>Atualizar</span>
            </button>
          </div>
        </div>

        {/* Quick Stats Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-white/10">
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <p className="text-[11px] font-medium text-slate-400">Criado em</p>
            <p className="text-xs font-bold text-white mt-0.5">{formatDate(admin?.createdAt)}</p>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <p className="text-[11px] font-medium text-slate-400">Último Login</p>
            <p className="text-xs font-bold text-white mt-0.5" title={formatDate(admin?.lastLoginAt)}>
              {formatRelativeTime(admin?.lastLoginAt)}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <p className="text-[11px] font-medium text-slate-400">Sessões Ativas</p>
            <p className="text-xs font-bold text-emerald-400 mt-0.5">{sessions.length || activeSessionsCount} conectadas</p>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <p className="text-[11px] font-medium text-slate-400">Ações Registradas</p>
            <p className="text-xs font-bold text-blue-400 mt-0.5">{totalAuditCount} auditorias</p>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-white/10 gap-2 overflow-x-auto pb-px">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-4 py-3 text-xs md:text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'overview'
              ? 'border-blue-500 text-white'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <User className="w-4 h-4" />
          Visão Geral & Dados
        </button>
        <button
          onClick={() => setActiveTab('security')}
          className={`flex items-center gap-2 px-4 py-3 text-xs md:text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'security'
              ? 'border-blue-500 text-white'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <KeyRound className="w-4 h-4" />
          Segurança & Senha
        </button>
        <button
          onClick={() => setActiveTab('sessions')}
          className={`flex items-center gap-2 px-4 py-3 text-xs md:text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'sessions'
              ? 'border-blue-500 text-white'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Monitor className="w-4 h-4" />
          Sessões Ativas ({sessions.length})
        </button>
        <button
          onClick={() => setActiveTab('activity')}
          className={`flex items-center gap-2 px-4 py-3 text-xs md:text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'activity'
              ? 'border-blue-500 text-white'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity className="w-4 h-4" />
          Meu Histórico de Ações
        </button>
      </div>

      {/* TAB CONTENT: 1. OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <User className="w-4 h-4 text-blue-400" />
                  Informações Pessoais
                </h2>
                <button
                  onClick={() => setIsEditingName(true)}
                  className="text-xs text-blue-400 hover:text-blue-300 font-semibold transition-colors flex items-center gap-1"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Editar Nome
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                  <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Nome Completo</span>
                  <p className="text-sm font-bold text-white">{admin?.name || '—'}</p>
                </div>

                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                  <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">E-mail Institucional</span>
                  <p className="text-sm font-bold text-white">{admin?.email || '—'}</p>
                </div>

                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                  <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Função Administrativa</span>
                  <p className="text-sm font-bold text-amber-400">{roleMeta.label}</p>
                </div>

                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                  <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Status Operacional</span>
                  <p className="text-sm font-bold text-emerald-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Ativo & Autorizado
                  </p>
                </div>
              </div>
            </div>

            {/* Permissions Card */}
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 space-y-4">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-400" />
                Permissões de Acesso do Perfil
              </h2>
              <div className="flex flex-wrap gap-2">
                {admin?.permissions && admin.permissions.length > 0 ? (
                  admin.permissions.map((perm) => (
                    <span
                      key={perm}
                      className="px-3 py-1 rounded-lg text-xs font-mono font-bold bg-blue-500/10 text-blue-300 border border-blue-500/20"
                    >
                      {perm === '*' ? 'Acesso Total (Superadmin)' : perm}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-500">Nenhuma permissão específica atribuída.</span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                As permissões definem os módulos aos quais sua conta tem autorização de visualização, edição e
                aprovação de operações críticas na plataforma.
              </p>
            </div>
          </div>

          {/* Right Column: Security Tips & Last Login */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 space-y-4">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-400" />
                Última Conexão
              </h2>
              <div className="space-y-2.5 text-xs text-slate-300">
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.02]">
                  <span className="text-slate-400">Horário:</span>
                  <span className="font-semibold text-white">{formatDate(admin?.lastLoginAt)}</span>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.02]">
                  <span className="text-slate-400">Endereço IP:</span>
                  <span className="font-mono font-semibold text-white">{admin?.lastLoginIp || '—'}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-white/[0.02] space-y-1">
                  <span className="text-slate-400 block">Navegador / Sistema:</span>
                  <span className="font-medium text-slate-300 block truncate" title={admin?.lastLoginUa || ''}>
                    {admin?.lastLoginUa ? parseUserAgent(admin.lastLoginUa).browser + ' (' + parseUserAgent(admin.lastLoginUa).os + ')' : '—'}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-6 space-y-3">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
                <AlertTriangle className="w-4 h-4" />
                Boas Práticas de Segurança
              </div>
              <ul className="text-[11px] text-slate-400 space-y-2 list-disc list-inside">
                <li>Nunca compartilhe suas credenciais administrativas com terceiros.</li>
                <li>Mantenha sua senha com mais de 12 caracteres, símbolos e números.</li>
                <li>Sempre encerre a sessão ao utilizar computadores compartilhados.</li>
                <li>Monitore regularmente as sessões ativas nesta página.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: 2. SECURITY & PASSWORD */}
      {activeTab === 'security' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <form onSubmit={handleChangePassword} className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 space-y-5">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-blue-400" />
                <h2 className="text-sm font-bold text-white">Alterar Senha de Acesso</h2>
              </div>

              <p className="text-xs text-slate-400">
                Para manter sua conta de administrador segura, escolha uma senha forte e única. Todas as outras
                sessões ativas em outros navegadores ou computadores serão desconectadas automaticamente após a alteração.
              </p>

              <div className="space-y-4">
                {/* Current Password */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Senha Atual</label>
                  <div className="relative">
                    <input
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Digite sua senha atual"
                      className="w-full bg-slate-950/80 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none focus:border-blue-500 transition-colors pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword((v) => !v)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-white transition-colors"
                    >
                      {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* New Password */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Nova Senha</label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Digite sua nova senha forte"
                      className="w-full bg-slate-950/80 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none focus:border-blue-500 transition-colors pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((v) => !v)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-white transition-colors"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Password Strength Meter */}
                  {newPassword.length > 0 && (
                    <div className="space-y-1.5 pt-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">Força da Senha:</span>
                        <span className={`font-bold ${passedCriteriaCount >= 4 ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {strengthLabel}
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className={`h-full ${strengthColor} transition-all duration-300`}
                          style={{ width: `${strengthPercentage}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Confirm Password */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Confirmar Nova Senha</label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repita a nova senha"
                      className="w-full bg-slate-950/80 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none focus:border-blue-500 transition-colors pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-white transition-colors"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Requirements Checklist */}
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-2">
                <span className="text-xs font-bold text-slate-300 block">Requisitos de Segurança:</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className={`flex items-center gap-2 ${hasMinLength ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {hasMinLength ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                    <span>No mínimo 12 caracteres</span>
                  </div>
                  <div className={`flex items-center gap-2 ${hasUpper ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {hasUpper ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                    <span>Uma letra maiúscula (A-Z)</span>
                  </div>
                  <div className={`flex items-center gap-2 ${hasLower ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {hasLower ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                    <span>Uma letra minúscula (a-z)</span>
                  </div>
                  <div className={`flex items-center gap-2 ${hasNumber ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {hasNumber ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                    <span>Pelo menos um número (0-9)</span>
                  </div>
                  <div className={`flex items-center gap-2 ${hasSymbol ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {hasSymbol ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                    <span>Símbolo especial (!@#$%...)</span>
                  </div>
                  <div className={`flex items-center gap-2 ${passwordsMatch ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {passwordsMatch ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                    <span>Senhas coincidem</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="submit"
                  disabled={passwordLoading || !hasMinLength || !passwordsMatch}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs md:text-sm font-bold disabled:opacity-40 transition-colors shadow-lg shadow-blue-600/20"
                >
                  {passwordLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Alterando...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      <span>Confirmar e Alterar Senha</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                Segurança da Sessão
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                As senhas de administradores utilizam fator de custo bcrypt elevado (12 rounds) para proteger
                contra ataques de força bruta offline e ataques de dicionário.
              </p>
              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">
                Sempre que você alterar a senha, seus cookies de sessão em outros aparelhos expiram imediatamente.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: 3. SESSIONS & DEVICES */}
      {activeTab === 'sessions' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border border-white/10 bg-slate-900/60">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Monitor className="w-4 h-4 text-blue-400" />
                Dispositivos Conectados
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Total de <span className="font-bold text-white">{sessions.length}</span> sessão(ões) ativa(s) no momento.
              </p>
            </div>

            {sessions.length > 1 && (
              <button
                onClick={() => setShowRevokeOthersModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-bold transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                Desconectar Outros Aparelhos
              </button>
            )}
          </div>

          <div className="divide-y divide-white/5 rounded-2xl border border-white/10 bg-slate-900/40 overflow-hidden">
            {sessions.map((sess) => {
              const isCurrent = sess.id === currentSessionId;
              const uaInfo = parseUserAgent(sess.userAgent);
              const DeviceIcon = uaInfo.deviceType === 'mobile' ? Smartphone : uaInfo.deviceType === 'tablet' ? Laptop : Monitor;

              return (
                <div key={sess.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-xl border ${isCurrent ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-white/5 border-white/10 text-slate-400'}`}>
                      <DeviceIcon className="w-5 h-5" />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-white">
                          {uaInfo.browser} no {uaInfo.os}
                        </span>
                        {isCurrent && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            Este Dispositivo
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                        <span className="flex items-center gap-1 font-mono text-slate-300">
                          <Globe className="w-3.5 h-3.5 text-slate-500" />
                          {sess.ipAddress || 'IP Oculto'}
                        </span>
                        <span>•</span>
                        <span>Última atividade: {formatRelativeTime(sess.lastActivityAt)}</span>
                        <span>•</span>
                        <span className="text-slate-500">Criada: {formatDate(sess.createdAt)}</span>
                      </div>

                      <p className="text-[11px] text-slate-500 font-mono truncate max-w-lg" title={sess.userAgent || ''}>
                        {sess.userAgent || 'User agent não informado'}
                      </p>
                    </div>
                  </div>

                  {!isCurrent && (
                    <button
                      onClick={() => setSessionToRevoke(sess.id)}
                      className="p-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-red-500/10 hover:border-red-500/30 text-slate-400 hover:text-red-400 transition-colors self-end sm:self-center"
                      title="Encerrar esta sessão"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB CONTENT: 4. AUDIT ACTIVITY */}
      {activeTab === 'activity' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between p-5 rounded-2xl border border-white/10 bg-slate-900/60">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-400" />
                Histórico de Atividades Desta Conta
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Registro imutável de ações administrativas efetuadas por você.
              </p>
            </div>
            <span className="text-xs font-bold text-slate-400 bg-white/5 px-3 py-1.5 rounded-xl border border-white/10">
              Página {auditPage} de {auditTotalPages}
            </span>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/40 overflow-hidden">
            {auditLogs.length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <Calendar className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-sm text-slate-400">Nenhuma atividade registrada até o momento.</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {auditLogs.map((log) => (
                  <div key={log.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-white/[0.02] transition-colors">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-white/10 text-white">
                          {log.action}
                        </span>
                        {log.module && (
                          <span className="text-[11px] text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                            {log.module}
                          </span>
                        )}
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                            log.success
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-red-500/10 text-red-400 border-red-500/20'
                          }`}
                        >
                          {log.success ? 'Sucesso' : 'Falha'}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                        <span>{formatDate(log.createdAt)}</span>
                        {log.ipAddress && (
                          <>
                            <span>•</span>
                            <span className="font-mono text-slate-300">IP: {log.ipAddress}</span>
                          </>
                        )}
                        {log.errorMsg && (
                          <>
                            <span>•</span>
                            <span className="text-red-400 font-semibold">{log.errorMsg}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pagination */}
          {auditTotalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => void loadAuditPage(auditPage - 1)}
                disabled={auditPage <= 1}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-xs font-semibold text-slate-300 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
                Anterior
              </button>
              <span className="text-xs text-slate-400">
                Página {auditPage} de {auditTotalPages}
              </span>
              <button
                onClick={() => void loadAuditPage(auditPage + 1)}
                disabled={auditPage >= auditTotalPages}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-xs font-semibold text-slate-300 disabled:opacity-40"
              >
                Próxima
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* EDIT NAME MODAL */}
      {isEditingName && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-blue-400" />
                Editar Nome do Perfil
              </h3>
              <button
                onClick={() => setIsEditingName(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateName} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Novo Nome</label>
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Ex: Gustavo"
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none focus:border-blue-500 transition-colors"
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditingName(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={nameLoading || !nameInput.trim()}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {nameLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM REVOKE SINGLE SESSION MODAL */}
      {sessionToRevoke && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400">
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">Desconectar Aparelho?</h3>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Você tem certeza de que deseja encerrar esta sessão remota? O usuário deste dispositivo será deslogado
              imediatamente.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSessionToRevoke(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleRevokeSingle}
                disabled={revokingSingle}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {revokingSingle && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Sim, Desconectar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM REVOKE ALL OTHERS MODAL */}
      {showRevokeOthersModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400">
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                <LogOut className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">Desconectar Todas as Outras Sessões?</h3>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Esta ação encerrará todas as sessões ativas desta conta em todos os outros computadores e navegadores.
              Apenas este dispositivo atual permanecerá conectado.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowRevokeOthersModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleRevokeOthers}
                disabled={revokingOthers}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {revokingOthers && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Desconectar Todas
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
