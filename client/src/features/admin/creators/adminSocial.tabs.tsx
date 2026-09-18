import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Youtube,
  Plus,
  Trash2,
  Search,
  X,
  Save,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Settings,
  RefreshCw,
  Loader2,
  AlertTriangle,
  Play,
  Star,
} from 'lucide-react';
import { api } from '../../../shared/auth/auth.store';
import { readAxiosResponseMessage } from '../lib/admin.api';
import {
  AddProfileModal,
  ChannelAvatar,
  EditProfileModal,
  RejectModal,
  STATUS_CFG,
} from './adminSocial.shared';
import type { Profile, RewardMiner, Submission } from './adminSocial.shared';

export function RewardSettingsPanel() {
  const [miner, setMiner] = useState<RewardMiner | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<RewardMiner[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await api.get<{ ok: boolean; minerId: number | null; miner: RewardMiner | null }>(
          '/admin/social/reward-settings',
        );
        if (res.data.ok) setMiner(res.data.miner);
      } catch {
        /* silent */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const searchMiners = (q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await api.get<{ ok: boolean; miners?: RewardMiner[] }>(
          `/admin/miners?q=${encodeURIComponent(q)}`,
        );
        if (res.data.ok) setSearchResults((res.data.miners ?? []).slice(0, 20));
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
  };

  const handleSelect = async (m: RewardMiner) => {
    setSearchQ('');
    setSearchResults([]);
    setSaving(true);
    try {
      const res = await api.put<{ ok: boolean; miner: RewardMiner | null }>('/admin/social/reward-settings', {
        minerId: m.id,
      });
      setMiner(res.data.miner);
      toast.success('Recompensa configurada.');
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      await api.put('/admin/social/reward-settings', { minerId: null });
      setMiner(null);
      toast.success('Recompensa desativada.');
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/8 bg-white/3 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Settings className="w-4 h-4 text-gray-400" />
        <p className="text-sm font-black text-white">Máquina de Recompensa</p>
      </div>
      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
        </div>
      ) : (
        <>
          {miner ? (
            <div className="flex items-center gap-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              {miner.imageUrl ? (
                <img src={miner.imageUrl} alt={miner.name} className="w-10 h-10 object-contain rounded-lg" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-gray-700 flex items-center justify-center text-gray-400 text-xs">
                  ?
                </div>
              )}
              <div className="flex-1">
                <p className="text-sm font-black text-white">{miner.name}</p>
                <p className="text-[10px] text-emerald-400">Recompensa configurada (ID: {miner.id})</p>
              </div>
              <button
                type="button"
                onClick={() => void handleClear()}
                disabled={saving}
                className="text-gray-600 hover:text-red-400 transition-colors"
                title="Remover recompensa"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Nenhuma máquina configurada — aprovações não concederão recompensa.
            </div>
          )}

          <div className="relative">
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">
              Buscar máquina de recompensa
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                value={searchQ}
                onChange={(e) => {
                  setSearchQ(e.target.value);
                  searchMiners(e.target.value);
                }}
                placeholder="Nome da máquina..."
                disabled={saving}
                className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary/50 disabled:opacity-50"
              />
              {searchLoading ? (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-500" />
              ) : null}
            </div>
            {searchResults.length > 0 ? (
              <div className="mt-1 rounded-xl border border-white/8 overflow-hidden z-10 bg-gray-900">
                {searchResults.map((m) => (
                  <button
                    type="button"
                    key={m.id}
                    onClick={() => void handleSelect(m)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5 transition-colors border-b border-white/5 last:border-0"
                  >
                    {m.imageUrl ? (
                      <img src={m.imageUrl} alt={m.name} className="w-8 h-8 object-contain rounded-lg shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center text-gray-500 text-xs shrink-0">
                        ?
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-bold text-white">{m.name}</p>
                      <p className="text-[10px] text-gray-500">ID: {m.id}</p>
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <p className="text-[10px] text-gray-600">
            Cada aprovação concede uma unidade desta máquina ao criador. Remova para desativar recompensas.
          </p>
        </>
      )}
    </div>
  );
}

export function RejectCredentialModal({
  profile,
  onClose,
  onRejected,
}: {
  profile: Profile;
  onClose: () => void;
  onRejected: () => void;
}) {
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReject = async () => {
    setLoading(true);
    try {
      await api.post(`/admin/social/credential-requests/${profile.id}/reject`, {
        rejectNote: note.trim() || undefined,
      });
      toast.success('Solicitação recusada.');
      onRejected();
      onClose();
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao recusar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
          <p className="font-black text-white">Recusar Credenciamento</p>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/8">
            <ChannelAvatar photo={profile.channelPhoto} name={profile.channelName} />
            <div>
              <p className="text-sm font-bold text-white">{profile.channelName}</p>
              <p className="text-[10px] text-gray-500">@{profile.user.username}</p>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">
              Motivo (opcional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Explique o motivo da recusa..."
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50 resize-none"
            />
          </div>
          <button
            type="button"
            onClick={() => void handleReject()}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 rounded-xl text-sm font-black text-white transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
            Recusar
          </button>
        </div>
      </div>
    </div>
  );
}

export function CredentialRequestsTab() {
  const [requests, setRequests] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectTarget, setRejectTarget] = useState<Profile | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ ok: boolean; profiles: Profile[] }>('/admin/social/credential-requests');
      if (res.data.ok) setRequests(res.data.profiles);
    } catch {
      toast.error('Erro ao carregar solicitações.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleApprove = async (profile: Profile) => {
    try {
      await api.post(`/admin/social/credential-requests/${profile.id}/approve`);
      toast.success(`${profile.channelName} credenciado!`);
      void load();
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao aprovar.');
    }
  };

  return (
    <>
      {rejectTarget ? (
        <RejectCredentialModal
          profile={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onRejected={() => void load()}
        />
      ) : null}

      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
          {requests.length} solicitaç{requests.length !== 1 ? 'ões' : 'ão'} pendente
          {requests.length !== 1 ? 's' : ''}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="p-2 rounded-xl bg-white/5 border border-white/8 text-gray-500 hover:text-white"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
        </div>
      ) : !requests.length ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-600">
          <Star className="w-10 h-10 opacity-30" />
          <p className="text-sm font-bold">Nenhuma solicitação pendente.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r.id} className="rounded-2xl border border-white/8 bg-white/3 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <ChannelAvatar photo={r.channelPhoto} name={r.channelName} size="lg" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-white">{r.channelName}</p>
                  <p className="text-[10px] text-gray-500">
                    @{r.user.username}
                    {r.user.email ? ` · ${r.user.email}` : ''}
                  </p>
                  {r.channelUrl ? (
                    <a
                      href={r.channelUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-red-400 hover:underline inline-flex items-center gap-1 mt-0.5"
                    >
                      <ExternalLink className="w-2.5 h-2.5" /> {r.channelUrl}
                    </a>
                  ) : null}
                  {r.bio ? <p className="text-xs text-gray-400 mt-1 italic">&quot;{r.bio}&quot;</p> : null}
                </div>
                <p className="text-[9px] text-gray-700 shrink-0">
                  {new Date(r.createdAt).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleApprove(r)}
                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-black text-white transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Aprovar
                </button>
                <button
                  type="button"
                  onClick={() => setRejectTarget(r)}
                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-red-600/20 hover:bg-red-600/30 rounded-xl text-xs font-black text-red-400 transition-colors border border-red-500/20"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Recusar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function ProfilesTab() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ ok: boolean; profiles: Profile[] }>('/admin/social/profiles');
      if (res.data.ok) setProfiles(res.data.profiles);
    } catch {
      toast.error('Erro ao carregar perfis.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Remover perfil de "${name}"? As submissões serão excluídas também.`)) return;
    try {
      await api.delete(`/admin/social/profiles/${id}`);
      toast.success('Perfil removido.');
      setProfiles((p) => p.filter((x) => x.id !== id));
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao remover.');
    }
  };

  return (
    <>
      {showAdd ? <AddProfileModal onClose={() => setShowAdd(false)} onAdded={() => void load()} /> : null}
      {editing ? (
        <EditProfileModal profile={editing} onClose={() => setEditing(null)} onSaved={() => void load()} />
      ) : null}

      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
          {profiles.length} criadores
        </p>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 rounded-xl text-xs font-black text-white transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Adicionar
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
        </div>
      ) : !profiles.length ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-600">
          <Youtube className="w-10 h-10 opacity-30" />
          <p className="text-sm font-bold">Nenhum criador cadastrado ainda.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {profiles.map((p) => (
            <div key={p.id} className="flex items-center gap-3 p-4 rounded-2xl border border-white/8 bg-white/3">
              <ChannelAvatar photo={p.channelPhoto} name={p.channelName} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-black text-white truncate">{p.channelName}</p>
                  {p.isCredentialed ? (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-red-600/20 text-red-400 border border-red-500/20 shrink-0">
                      Credenciado
                    </span>
                  ) : null}
                </div>
                <p className="text-[10px] text-gray-500">
                  @{p.user.username} · {p._count?.submissions ?? 0} envio(s)
                </p>
                {p.channelUrl ? (
                  <a
                    href={p.channelUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-red-400 hover:underline inline-flex items-center gap-1 mt-0.5"
                  >
                    <ExternalLink className="w-2.5 h-2.5" /> Canal
                  </a>
                ) : null}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditing(p)}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                >
                  <Save className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(p.id, p.channelName)}
                  className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function SubmissionsTab() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [rejectTarget, setRejectTarget] = useState<Submission | null>(null);

  const load = useCallback(async (s: string) => {
    setLoading(true);
    try {
      const res = await api.get<{ ok: boolean; submissions: Submission[] }>(
        `/admin/social/submissions?status=${s}`,
      );
      if (res.data.ok) setSubmissions(res.data.submissions);
    } catch {
      toast.error('Erro ao carregar vídeos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(statusFilter);
  }, [statusFilter, load]);

  const handleDelete = async (sub: Submission) => {
    if (
      !confirm(
        `Remover este vídeo da lista?\n\n"${sub.title ?? sub.videoUrl}"\n\nA recompensa já entregue ao usuário NÃO será revogada.`,
      )
    ) {
      return;
    }
    try {
      await api.delete(`/admin/social/submissions/${sub.id}`);
      toast.success('Vídeo removido.');
      void load(statusFilter);
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao remover.');
    }
  };

  const handleApprove = async (sub: Submission) => {
    try {
      const res = await api.post<{ ok: boolean; rewardGranted: boolean; rewardMinerName: string | null }>(
        `/admin/social/submissions/${sub.id}/approve`,
      );
      if (res.data.rewardGranted) {
        toast.success(`Aprovado! Máquina "${res.data.rewardMinerName}" concedida.`);
      } else {
        toast.success('Aprovado (sem recompensa configurada).');
      }
      void load(statusFilter);
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao aprovar.');
    }
  };

  const filterBtns: { label: string; value: string }[] = [
    { label: 'Pendentes', value: 'pending' },
    { label: 'Aprovados', value: 'approved' },
    { label: 'Recusados', value: 'rejected' },
    { label: 'Todos', value: 'all' },
  ];

  return (
    <>
      {rejectTarget ? (
        <RejectModal
          submission={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onRejected={() => void load(statusFilter)}
        />
      ) : null}

      <div className="flex flex-wrap gap-2 mb-4">
        {filterBtns.map((b) => (
          <button
            type="button"
            key={b.value}
            onClick={() => setStatusFilter(b.value)}
            className={`px-4 py-1.5 rounded-xl text-xs font-black transition-colors ${
              statusFilter === b.value
                ? 'bg-primary text-white'
                : 'bg-white/5 text-gray-500 hover:text-white border border-white/8'
            }`}
          >
            {b.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void load(statusFilter)}
          className="p-2 rounded-xl bg-white/5 border border-white/8 text-gray-500 hover:text-white ml-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
        </div>
      ) : !submissions.length ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-600">
          <Youtube className="w-10 h-10 opacity-30" />
          <p className="text-sm font-bold">Nenhuma submissão encontrada.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {submissions.map((s) => {
            const cfg = STATUS_CFG[s.status] ?? STATUS_CFG.pending;
            const Icon = cfg.icon;
            return (
              <div key={s.id} className="rounded-2xl border border-white/8 bg-white/3 overflow-hidden">
                <div className="flex items-start gap-3 p-4">
                  <a href={s.videoUrl} target="_blank" rel="noopener noreferrer" className="relative shrink-0 group">
                    <img
                      src={`https://img.youtube.com/vi/${s.videoId}/mqdefault.jpg`}
                      alt=""
                      className="w-24 h-[54px] rounded-xl object-cover border border-white/10"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-7 h-7 rounded-full bg-red-600 flex items-center justify-center">
                        <Play className="w-3 h-3 text-white fill-white" />
                      </div>
                    </div>
                  </a>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-white leading-tight truncate">
                      {s.title ?? s.videoUrl}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <ChannelAvatar
                        photo={s.profile.channelPhoto}
                        name={s.profile.channelName}
                        size="sm"
                      />
                      <span className="text-[10px] text-gray-500">{s.profile.channelName}</span>
                      <span className="text-[9px] text-gray-700">·</span>
                      <span className="text-[10px] text-gray-600">@{s.user.username}</span>
                    </div>
                    {s.reviewNote ? (
                      <p className="text-[10px] text-gray-500 mt-1 italic">&quot;{s.reviewNote}&quot;</p>
                    ) : null}
                    {s.status === 'approved' && s.rewardGranted && s.miner ? (
                      <p className="text-[10px] text-emerald-400 mt-1">Máquina: {s.miner.name}</p>
                    ) : null}
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full border ${cfg.cls}`}
                    >
                      <Icon className="w-3 h-3" />
                      {cfg.label}
                    </span>
                    <p className="text-[9px] text-gray-700">
                      {new Date(s.submittedAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>

                {s.status === 'pending' ? (
                  <div className="flex gap-2 px-4 pb-4 pt-0">
                    <button
                      type="button"
                      onClick={() => void handleApprove(s)}
                      className="flex-1 flex items-center justify-center gap-2 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-black text-white transition-colors"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Aprovar
                    </button>
                    <button
                      type="button"
                      onClick={() => setRejectTarget(s)}
                      className="flex-1 flex items-center justify-center gap-2 py-2 bg-red-600/20 hover:bg-red-600/30 rounded-xl text-xs font-black text-red-400 transition-colors border border-red-500/20"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Recusar
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2 px-4 pb-4 pt-0">
                    <button
                      type="button"
                      onClick={() => void handleDelete(s)}
                      className="flex items-center justify-center gap-2 py-2 px-3 bg-red-500/10 hover:bg-red-500/20 rounded-xl text-xs font-black text-red-400 hover:text-red-300 transition-colors border border-red-500/20"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remover
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
