import { useState, useEffect, useCallback } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  Key,
  RefreshCw,
  Power,
  CircleCheck,
  CircleX,
  Clock,
  Laptop,
  Smartphone,
  X,
  Copy,
  Check,
} from 'lucide-react';
import {
  listAdmins,
  createAdminUser,
  updateAdminUser,
  resetAdminUserPassword,
  getAdminUserSessions,
  revokeAdminUserSessions,
} from '../lib/admin.api';
import type { AdminUserItem, AdminSessionItem } from '../lib/admin.types';

// ---------------------------------------------------------------------------
// Helpers & Utilities
// ---------------------------------------------------------------------------

function formatDate(iso?: string | null): string {
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
    return iso;
  }
}

function formatRelativeTime(iso?: string | null): string {
  if (!iso) return 'Nunca';
  try {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return 'agora mesmo';
    if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
    if (diff < 604800) return `há ${Math.floor(diff / 86400)}d`;
    return formatDate(iso).split(',')[0] ?? '';
  } catch {
    return '';
  }
}

function generateSecurePassword(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=';
  let pwd = '';
  pwd += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
  pwd += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)];
  pwd += '0123456789'[Math.floor(Math.random() * 10)];
  pwd += '!@#$%^&*'[Math.floor(Math.random() * 8)];
  for (let i = 4; i < 16; i++) {
    pwd += chars[Math.floor(Math.random() * chars.length)];
  }
  return pwd.split('').sort(() => 0.5 - Math.random()).join('');
}

function isStrongPassword(pwd: string): boolean {
  return (
    pwd.length >= 12 &&
    /[A-Z]/.test(pwd) &&
    /[a-z]/.test(pwd) &&
    /[0-9]/.test(pwd) &&
    /[^A-Za-z0-9]/.test(pwd)
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function AdminAdminsPage() {
  const [admins, setAdmins] = useState<AdminUserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editAdmin, setEditAdmin] = useState<AdminUserItem | null>(null);
  const [resetPwdAdmin, setResetPwdAdmin] = useState<AdminUserItem | null>(null);
  const [sessionsAdmin, setSessionsAdmin] = useState<AdminUserItem | null>(null);
  const [adminSessions, setAdminSessions] = useState<AdminSessionItem[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // Form states: Create
  const [createForm, setCreateForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'admin',
  });
  const [submittingCreate, setSubmittingCreate] = useState(false);

  // Form states: Edit
  const [editForm, setEditForm] = useState({
    name: '',
    role: 'admin',
    isActive: true,
  });
  const [submittingEdit, setSubmittingEdit] = useState(false);

  // Form states: Reset Password
  const [newPassword, setNewPassword] = useState('');
  const [submittingResetPwd, setSubmittingResetPwd] = useState(false);
  const [copiedNewPwd, setCopiedNewPwd] = useState(false);

  // Load admins list
  const loadAdmins = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAdmins();
      if (res.data?.ok && Array.isArray(res.data.admins)) {
        setAdmins(res.data.admins);
      }
    } catch {
      setFeedbackMsg({ type: 'error', text: 'Erro ao carregar lista de administradores.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAdmins();
  }, [loadAdmins]);

  // Flash feedback auto-clear
  useEffect(() => {
    if (!feedbackMsg) return;
    const t = setTimeout(() => setFeedbackMsg(null), 5000);
    return () => clearTimeout(t);
  }, [feedbackMsg]);

  // Handle Create Admin
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name || !createForm.email || !createForm.password) return;
    if (!isStrongPassword(createForm.password)) {
      setFeedbackMsg({
        type: 'error',
        text: 'A senha deve ter no mínimo 12 caracteres com maiúsculas, minúsculas, números e símbolos.',
      });
      return;
    }

    setSubmittingCreate(true);
    try {
      const res = await createAdminUser(createForm);
      if (res.data?.ok) {
        setFeedbackMsg({ type: 'ok', text: `Administrador ${res.data.admin.name} criado com sucesso!` });
        setShowCreateModal(false);
        setCreateForm({ name: '', email: '', password: '', role: 'admin' });
        void loadAdmins();
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Falha ao criar administrador.';
      setFeedbackMsg({ type: 'error', text: msg });
    } finally {
      setSubmittingCreate(false);
    }
  };

  // Open Edit Modal
  const openEdit = (adm: AdminUserItem) => {
    setEditAdmin(adm);
    setEditForm({
      name: adm.name,
      role: adm.role,
      isActive: adm.isActive,
    });
  };

  // Handle Edit Submit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editAdmin) return;
    setSubmittingEdit(true);
    try {
      const res = await updateAdminUser(editAdmin.id, editForm);
      if (res.data?.ok) {
        setFeedbackMsg({ type: 'ok', text: `Administrador ${editAdmin.name} atualizado com sucesso!` });
        setEditAdmin(null);
        void loadAdmins();
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Falha ao atualizar administrador.';
      setFeedbackMsg({ type: 'error', text: msg });
    } finally {
      setSubmittingEdit(false);
    }
  };

  // Open Reset Password Modal
  const openResetPwd = (adm: AdminUserItem) => {
    setResetPwdAdmin(adm);
    setNewPassword(generateSecurePassword());
    setCopiedNewPwd(false);
  };

  // Handle Reset Password Submit
  const handleResetPwdSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPwdAdmin || !newPassword) return;
    if (!isStrongPassword(newPassword)) {
      setFeedbackMsg({
        type: 'error',
        text: 'A senha deve ter no mínimo 12 caracteres com maiúsculas, minúsculas, números e símbolos.',
      });
      return;
    }

    setSubmittingResetPwd(true);
    try {
      const res = await resetAdminUserPassword(resetPwdAdmin.id, newPassword);
      if (res.data?.ok) {
        setFeedbackMsg({
          type: 'ok',
          text: `Senha de ${resetPwdAdmin.name} redefinida com sucesso. Todas as sessões anteriores foram revogadas.`,
        });
        setResetPwdAdmin(null);
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Falha ao resetar senha.';
      setFeedbackMsg({ type: 'error', text: msg });
    } finally {
      setSubmittingResetPwd(false);
    }
  };

  // Open Sessions Modal
  const openSessions = async (adm: AdminUserItem) => {
    setSessionsAdmin(adm);
    setLoadingSessions(true);
    try {
      const res = await getAdminUserSessions(adm.id);
      if (res.data?.ok && Array.isArray(res.data.sessions)) {
        setAdminSessions(res.data.sessions);
      }
    } catch {
      setAdminSessions([]);
    } finally {
      setLoadingSessions(false);
    }
  };

  // Handle Revoke All Sessions for Admin
  const handleRevokeSessions = async () => {
    if (!sessionsAdmin) return;
    try {
      const res = await revokeAdminUserSessions(sessionsAdmin.id);
      if (res.data?.ok) {
        setFeedbackMsg({
          type: 'ok',
          text: `${res.data.revokedCount} sessões revogadas para ${sessionsAdmin.name}.`,
        });
        setAdminSessions([]);
      }
    } catch {
      setFeedbackMsg({ type: 'error', text: 'Falha ao revogar sessões.' });
    }
  };

  // Stats calculation
  const totalAdmins = admins.length;
  const superAdmins = admins.filter((a) => a.role === 'super_admin').length;
  const activeAdmins = admins.filter((a) => a.isActive).length;
  const inactiveAdmins = totalAdmins - activeAdmins;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500/20 via-blue-500/10 to-transparent border border-indigo-500/30 flex items-center justify-center shadow-lg shadow-indigo-500/5">
            <Users className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white tracking-tight">Usuários Administradores</h1>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 font-semibold border border-indigo-500/20">
                Controle de Acesso RBAC
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Gerenciamento de contas administrativas, atribuição de funções e auditoria de credenciais.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            Novo Administrador
          </button>
          <button
            onClick={loadAdmins}
            disabled={loading}
            className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors disabled:opacity-40"
            title="Recarregar"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedbackMsg && (
        <div
          className={`p-3.5 rounded-2xl border text-xs flex items-center gap-2 animate-fadeIn ${
            feedbackMsg.type === 'ok'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
          }`}
        >
          {feedbackMsg.type === 'ok' ? (
            <CircleCheck className="w-4 h-4 flex-shrink-0" />
          ) : (
            <CircleX className="w-4 h-4 flex-shrink-0" />
          )}
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {/* 2. Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl bg-zinc-900/60 border border-white/10 p-4 backdrop-blur-sm">
          <div className="text-xs text-gray-400 mb-1 flex items-center justify-between">
            <span>Total Cadastrado</span>
            <Users className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-black text-white">{totalAdmins}</div>
          <div className="text-[11px] text-gray-500 mt-1">contas no banco de dados</div>
        </div>

        <div className="rounded-2xl bg-zinc-900/60 border border-white/10 p-4 backdrop-blur-sm">
          <div className="text-xs text-gray-400 mb-1 flex items-center justify-between">
            <span>Super Administradores</span>
            <Shield className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-400">{superAdmins}</div>
          <div className="text-[11px] text-gray-500 mt-1">acesso total irrestrito</div>
        </div>

        <div className="rounded-2xl bg-zinc-900/60 border border-white/10 p-4 backdrop-blur-sm">
          <div className="text-xs text-gray-400 mb-1 flex items-center justify-between">
            <span>Contas Ativas</span>
            <CircleCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400">{activeAdmins}</div>
          <div className="text-[11px] text-gray-500 mt-1">com permissão de login</div>
        </div>

        <div className="rounded-2xl bg-zinc-900/60 border border-white/10 p-4 backdrop-blur-sm">
          <div className="text-xs text-gray-400 mb-1 flex items-center justify-between">
            <span>Contas Desativadas</span>
            <Power className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-black text-rose-400">{inactiveAdmins}</div>
          <div className="text-[11px] text-gray-500 mt-1">acesso bloqueado</div>
        </div>
      </div>

      {/* 3. Table Container */}
      <div className="rounded-2xl border border-white/10 bg-zinc-900/60 backdrop-blur-sm overflow-hidden shadow-xl">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 space-y-3">
            <RefreshCw className="w-7 h-7 animate-spin text-blue-400" />
            <p className="text-xs font-medium">Carregando administradores...</p>
          </div>
        ) : !admins.length ? (
          <div className="text-center py-16 px-4 space-y-2">
            <Users className="w-10 h-10 text-gray-600 mx-auto" />
            <h3 className="text-sm font-semibold text-white">Nenhum administrador encontrado</h3>
            <p className="text-xs text-gray-400">Clique em "Novo Administrador" para cadastrar uma conta.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.02] text-gray-400 uppercase text-[10px] tracking-wider font-semibold">
                  <th className="px-5 py-3.5">Administrador</th>
                  <th className="px-4 py-3.5">Função (Role)</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Último Login</th>
                  <th className="px-4 py-3.5">IP de Acesso</th>
                  <th className="px-4 py-3.5">Criado em</th>
                  <th className="px-5 py-3.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {admins.map((adm) => {
                  const isSuper = adm.role === 'super_admin';

                  return (
                    <tr key={adm.id} className="hover:bg-white/[0.03] transition-colors">
                      {/* Admin Identity */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold shadow-sm ${
                              isSuper
                                ? 'bg-gradient-to-tr from-amber-600 to-yellow-500'
                                : 'bg-gradient-to-tr from-blue-600 to-indigo-600'
                            }`}
                          >
                            {adm.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-white text-xs flex items-center gap-1.5">
                              <span>{adm.name}</span>
                              <span className="text-[10px] font-mono text-gray-500">#{adm.id}</span>
                            </div>
                            <div className="text-[11px] text-gray-400 font-mono">{adm.email}</div>
                          </div>
                        </div>
                      </td>

                      {/* Role Badge */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {isSuper ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            <Shield className="w-3 h-3 text-amber-400" /> Super Admin
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30">
                            <Shield className="w-3 h-3 text-blue-400" /> Administrador
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {adm.isActive ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CircleCheck className="w-3 h-3" /> Ativa
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            <CircleX className="w-3 h-3" /> Inativa
                          </span>
                        )}
                      </td>

                      {/* Last Login */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-1 text-gray-300">
                          <Clock className="w-3 h-3 text-gray-500" />
                          <span>{formatRelativeTime(adm.lastLoginAt)}</span>
                        </div>
                        {adm.lastLoginAt && (
                          <div className="text-[10px] text-gray-500 mt-0.5">{formatDate(adm.lastLoginAt)}</div>
                        )}
                      </td>

                      {/* Last IP */}
                      <td className="px-4 py-3.5 whitespace-nowrap font-mono text-gray-400 text-[11px]">
                        {adm.lastLoginIp ?? '—'}
                      </td>

                      {/* Created At */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-gray-400 text-[11px]">
                        {formatDate(adm.createdAt).split(',')[0]}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openEdit(adm)}
                            className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-colors text-[11px] font-medium"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => openResetPwd(adm)}
                            className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 transition-colors text-[11px] font-medium flex items-center gap-1"
                            title="Redefinir senha do admin"
                          >
                            <Key className="w-3 h-3" /> Senha
                          </button>
                          <button
                            onClick={() => openSessions(adm)}
                            className="px-2.5 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/20 transition-colors text-[11px] font-medium"
                            title="Ver sessões ativas"
                          >
                            Sessões
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------------------------
          MODAL 1: Create Admin
         --------------------------------------------------------------------- */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="w-full max-w-md bg-zinc-900 border border-white/15 rounded-3xl p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-400" />
                <h3 className="text-base font-bold text-white">Criar Novo Administrador</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Nome Completo</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Carlos Silva"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">E-mail de Acesso</label>
                <input
                  type="email"
                  required
                  placeholder="admin@blockminer.space"
                  value={createForm.email}
                  onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Função (Role)</label>
                <select
                  value={createForm.role}
                  onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value }))}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="admin">Administrador Padrão</option>
                  <option value="super_admin">Super Administrador (Acesso Total)</option>
                  <option value="finance">Financeiro</option>
                  <option value="moderator">Moderador</option>
                  <option value="support">Suporte</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-gray-400">Senha Inicial</label>
                  <button
                    type="button"
                    onClick={() =>
                      setCreateForm((f) => ({ ...f, password: generateSecurePassword() }))
                    }
                    className="text-[11px] text-blue-400 hover:text-blue-300"
                  >
                    Gerar Senha Forte
                  </button>
                </div>
                <input
                  type="text"
                  required
                  placeholder="Mínimo 12 caracteres..."
                  value={createForm.password}
                  onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                />
                <div className="text-[10px] text-gray-500 mt-1">
                  Requisitos: 12+ chars, maiúscula, minúscula, número e símbolo especial.
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-gray-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingCreate}
                  className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs text-white font-bold transition-all disabled:opacity-50"
                >
                  {submittingCreate ? 'Criando...' : 'Criar Conta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------
          MODAL 2: Edit Admin
         --------------------------------------------------------------------- */}
      {editAdmin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
          onClick={() => setEditAdmin(null)}
        >
          <div
            className="w-full max-w-md bg-zinc-900 border border-white/15 rounded-3xl p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <h3 className="text-base font-bold text-white">Editar Administrador</h3>
                <div className="text-xs text-gray-400">{editAdmin.email}</div>
              </div>
              <button onClick={() => setEditAdmin(null)} className="p-1 rounded-lg text-gray-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Nome</label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Função (Role)</label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="admin">Administrador Padrão</option>
                  <option value="super_admin">Super Administrador (Acesso Total)</option>
                  <option value="finance">Financeiro</option>
                  <option value="moderator">Moderador</option>
                  <option value="support">Suporte</option>
                </select>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                <div>
                  <div className="text-xs font-semibold text-white">Status da Conta</div>
                  <div className="text-[11px] text-gray-400">Permitir que este administrador faça login</div>
                </div>
                <input
                  type="checkbox"
                  checked={editForm.isActive}
                  onChange={(e) => setEditForm((f) => ({ ...f, isActive: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-600 bg-black/40 text-blue-500 focus:ring-0"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setEditAdmin(null)}
                  className="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-gray-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingEdit}
                  className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs text-white font-bold transition-all disabled:opacity-50"
                >
                  {submittingEdit ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------
          MODAL 3: Reset Password
         --------------------------------------------------------------------- */}
      {resetPwdAdmin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
          onClick={() => setResetPwdAdmin(null)}
        >
          <div
            className="w-full max-w-md bg-zinc-900 border border-white/15 rounded-3xl p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-base font-bold text-white">Redefinir Senha</h3>
                  <div className="text-xs text-gray-400">{resetPwdAdmin.name} ({resetPwdAdmin.email})</div>
                </div>
              </div>
              <button onClick={() => setResetPwdAdmin(null)} className="p-1 rounded-lg text-gray-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleResetPwdSubmit} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-gray-400">Nova Senha Gerada</label>
                  <button
                    type="button"
                    onClick={() => {
                      setNewPassword(generateSecurePassword());
                      setCopiedNewPwd(false);
                    }}
                    className="text-[11px] text-blue-400 hover:text-blue-300"
                  >
                    Gerar Outra
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500 pr-20"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(newPassword);
                      setCopiedNewPwd(true);
                      setTimeout(() => setCopiedNewPwd(false), 2000);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded bg-white/10 hover:bg-white/15 text-[10px] text-gray-300 flex items-center gap-1"
                  >
                    {copiedNewPwd ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copiedNewPwd ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 space-y-1">
                <strong>Atenção:</strong> Ao confirmar, todas as sessões ativas deste administrador em outros computadores ou celulares serão canceladas imediatamente.
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setResetPwdAdmin(null)}
                  className="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-gray-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingResetPwd}
                  className="px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-xs text-white font-bold transition-all disabled:opacity-50"
                >
                  {submittingResetPwd ? 'Salvando...' : 'Confirmar e Alterar Senha'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------
          MODAL 4: Admin Active Sessions
         --------------------------------------------------------------------- */}
      {sessionsAdmin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
          onClick={() => setSessionsAdmin(null)}
        >
          <div
            className="w-full max-w-xl bg-zinc-900 border border-white/15 rounded-3xl p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <h3 className="text-base font-bold text-white">Sessões Ativas</h3>
                <div className="text-xs text-gray-400">{sessionsAdmin.name} ({sessionsAdmin.email})</div>
              </div>
              <button onClick={() => setSessionsAdmin(null)} className="p-1 rounded-lg text-gray-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {loadingSessions ? (
              <div className="flex items-center justify-center py-10 text-gray-400">
                <RefreshCw className="w-5 h-5 animate-spin text-blue-400" />
              </div>
            ) : !adminSessions.length ? (
              <div className="text-center py-10 text-gray-500 text-xs">
                Nenhuma sessão ativa encontrada para este administrador.
              </div>
            ) : (
              <div className="space-y-2">
                {adminSessions.map((s) => (
                  <div
                    key={s.id}
                    className="p-3 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                        {/mobile|android|iphone/i.test(s.userAgent || '') ? (
                          <Smartphone className="w-3.5 h-3.5" />
                        ) : (
                          <Laptop className="w-3.5 h-3.5" />
                        )}
                      </div>
                      <div>
                        <div className="font-mono text-white text-xs">{s.ipAddress ?? 'IP desconhecido'}</div>
                        <div className="text-[10px] text-gray-500 font-mono truncate max-w-[260px]">
                          {s.userAgent ?? 'Navegador padrão'}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-gray-400">Conectado {formatRelativeTime(s.createdAt)}</div>
                      <div className="text-[9px] text-gray-600 font-mono">{formatDate(s.createdAt)}</div>
                    </div>
                  </div>
                ))}

                <div className="pt-2">
                  <button
                    onClick={handleRevokeSessions}
                    className="w-full py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-semibold transition-colors"
                  >
                    Revogar Todas as Sessões Deste Admin
                  </button>
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-white/10 flex justify-end">
              <button
                onClick={() => setSessionsAdmin(null)}
                className="px-4 py-1.5 rounded-xl bg-white/10 text-white text-xs font-semibold hover:bg-white/15"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
