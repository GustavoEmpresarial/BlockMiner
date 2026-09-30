import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ShieldAlert,
  ShieldCheck,
  RotateCcw,
  UserCheck,
  UserX,
  AlertTriangle,
  History,
  Monitor,
  Fingerprint,
  ChevronLeft,
  Loader2,
  Calendar,
  Mail,
  User as UserIcon,
  Activity,
  Globe,
  Ban,
  X,
  Send,
} from 'lucide-react';
import { toast } from 'sonner';
import { adminAntibotApi } from './adminAntibot.api';
import { BAND_STYLE, SEVERITY_STYLE, bandForScore, fmtDateShort } from './adminAntibot.shared';
import type { AdminAntibotUserProfile } from './adminAntibot.types';

export default function AdminAntibotUserProfilePage() {
  const { id } = useParams<{ id: string }>();
  const userId = Number(id);

  const [data, setData] = useState<AdminAntibotUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);
  const [trusting, setTrusting] = useState(false);
  const [trustModalOpen, setTrustModalOpen] = useState(false);
  const [trustReason, setTrustReason] = useState('');

  const loadProfile = useCallback(async () => {
    if (!userId || Number.isNaN(userId)) return;
    setLoading(true);
    try {
      const res = await adminAntibotApi.getUserProfile(userId, 100);
      setData(res.data);
    } catch {
      toast.error('Erro ao carregar perfil antibot do usuário.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const handleRecompute = async () => {
    if (!userId) return;
    setRecomputing(true);
    try {
      const res = await adminAntibotApi.recomputeScore(userId);
      if (res.data.ok) {
        toast.success(`Pontuação recalculada: ${res.data.score}/100 (${res.data.band})`);
        void loadProfile();
      }
    } catch {
      toast.error('Erro ao recalcular pontuação de risco.');
    } finally {
      setRecomputing(false);
    }
  };

  const handleSetTrusted = async (trusted: boolean) => {
    if (!userId) return;
    setTrusting(true);
    try {
      const res = await adminAntibotApi.setTrusted(userId, {
        trusted,
        reason: trustReason.trim() || null,
      });
      if (res.data.ok) {
        toast.success(trusted ? 'Usuário marcado como confiável (whitelist)!' : 'Confiança removida.');
        setTrustModalOpen(false);
        setTrustReason('');
        void loadProfile();
      }
    } catch {
      toast.error('Erro ao atualizar status de confiança.');
    } finally {
      setTrusting(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin mb-3" />
        <p className="text-xs font-bold">Carregando dossiê antibot...</p>
      </div>
    );
  }

  if (!data?.user) {
    return (
      <div className="p-8 text-center space-y-4">
        <h2 className="text-xl font-bold text-white">Usuário não encontrado</h2>
        <Link to="/admin/antibot" className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400">
          <ChevronLeft className="w-4 h-4" />
          Voltar para o AntiBot
        </Link>
      </div>
    );
  }

  const { user, profile, evidence, sessions, devices } = data;
  const band = profile.band ?? bandForScore(profile.riskScore);
  const bandCfg = BAND_STYLE[band];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Back button */}
      <div>
        <Link
          to="/admin/antibot"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Voltar para a Visão Geral do AntiBot
        </Link>
      </div>

      {/* Main Profile Header */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 flex-wrap">
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-2xl border flex items-center justify-center font-black text-2xl shadow-xl ${bandCfg.badge}`}>
              {profile.riskScore}
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl font-black text-white tracking-tight">
                  {user.username ?? `Usuário #${user.id}`}
                </h1>
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${bandCfg.badge}`}>
                  Faixa {bandCfg.label}
                </span>
                {profile.trusted && (
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> Confiável
                  </span>
                )}
                {user.isBanned && (
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/40 flex items-center gap-1">
                    <Ban className="w-3 h-3" /> Banido
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <UserIcon className="w-3.5 h-3.5 text-slate-500" />
                  ID #{user.id}
                </span>
                <span className="flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-slate-500" />
                  {user.email}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  Registrado em {new Date(user.createdAt).toLocaleDateString('pt-BR')}
                </span>
              </div>

              {profile.trustedReason && (
                <p className="text-xs text-slate-400 italic pt-1">
                  Motivo da confiança: &ldquo;{profile.trustedReason}&rdquo;
                </p>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={handleRecompute}
              disabled={recomputing}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-200 text-xs font-bold hover:bg-slate-700 transition-all shadow-sm disabled:opacity-50"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${recomputing ? 'animate-spin' : ''}`} />
              Recalcular Score
            </button>

            {profile.trusted ? (
              <button
                type="button"
                onClick={() => void handleSetTrusted(false)}
                disabled={trusting}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 text-xs font-bold transition-all shadow-sm disabled:opacity-50"
              >
                <UserX className="w-3.5 h-3.5" />
                Remover Confiança
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setTrustModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 text-xs font-bold transition-all shadow-sm"
              >
                <UserCheck className="w-3.5 h-3.5" />
                Marcar Confiável
              </button>
            )}
          </div>
        </div>

        {/* 4 Score Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-slate-800/80">
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pontuação de Risco</div>
            <div className="text-xl font-black text-white mt-1">{profile.riskScore}/100</div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Índice de Confiança</div>
            <div className="text-xl font-black text-emerald-400 mt-1">{profile.trustScore}%</div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pico de Risco Histórico</div>
            <div className="text-xl font-black text-amber-400 mt-1">{profile.peakRiskScore}/100</div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total de Evidências</div>
            <div className="text-xl font-black text-purple-400 mt-1">{profile.evidenceCount}</div>
          </div>
        </div>
      </div>

      {/* Evidence Timeline Section */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-amber-400" />
          <h2 className="text-base font-bold text-white">Histórico de Evidências Detectadas ({evidence.length})</h2>
        </div>

        {evidence.length === 0 ? (
          <p className="text-xs text-slate-500 py-4">Nenhuma evidência registrada para este jogador.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 font-bold uppercase text-[10px] border-b border-slate-800">
                <tr>
                  <th className="p-3">Código</th>
                  <th className="p-3">Detector</th>
                  <th className="p-3">Gravidade</th>
                  <th className="p-3">Peso</th>
                  <th className="p-3">Evolução Score</th>
                  <th className="p-3">IP / Dispositivo</th>
                  <th className="p-3 text-right">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {evidence.map((ev) => {
                  const sevStyle = SEVERITY_STYLE[ev.severity] ?? SEVERITY_STYLE.info;
                  return (
                    <tr key={ev.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-3">
                        <span className="font-mono font-bold text-white">{ev.code}</span>
                        <p className="text-[11px] text-slate-400 mt-0.5">{ev.reason}</p>
                      </td>
                      <td className="p-3 font-medium text-slate-300">{ev.detector}</td>
                      <td className="p-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${sevStyle}`}>
                          {ev.severity}
                        </span>
                      </td>
                      <td className="p-3 font-mono font-bold text-amber-400">+{ev.weight}</td>
                      <td className="p-3 font-mono text-slate-300">
                        {ev.scoreBefore} → <strong className="text-white">{ev.scoreAfter}</strong>
                      </td>
                      <td className="p-3 font-mono text-[11px] text-slate-400">
                        {ev.ip && <div>IP: {ev.ip}</div>}
                        {ev.deviceId && <div>Dev: {ev.deviceId.slice(0, 12)}...</div>}
                      </td>
                      <td className="p-3 font-mono text-slate-400 text-right whitespace-nowrap">
                        {fmtDateShort(ev.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Devices and Sessions Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Sessions */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Monitor className="w-4 h-4 text-sky-400" />
            <h2 className="text-base font-bold text-white">Sessões ({sessions.length})</h2>
          </div>
          {sessions.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">Nenhuma sessão registrada.</p>
          ) : (
            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800">
              {sessions.map((sess) => (
                <div key={sess.id} className="p-3 rounded-xl border border-slate-800/80 bg-slate-950/40 text-xs space-y-1">
                  <div className="flex items-center justify-between text-slate-300 font-bold">
                    <span>{sess.browser ?? 'Desconhecido'} no {sess.os ?? sess.platform ?? 'SO Desconhecido'}</span>
                    <span className="font-mono text-[10px] text-slate-500">{fmtDateShort(sess.lastSeenAt)}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2">
                    <span>IP: {sess.ip ?? '—'}</span>
                    {sess.country && <span>({sess.country})</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Devices */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Fingerprint className="w-4 h-4 text-purple-400" />
            <h2 className="text-base font-bold text-white">Dispositivos Conhecidos ({devices.length})</h2>
          </div>
          {devices.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">Nenhum dispositivo mapeado.</p>
          ) : (
            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800">
              {devices.map((dev) => (
                <div key={dev.deviceId} className="p-3 rounded-xl border border-slate-800/80 bg-slate-950/40 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-white">{dev.deviceId.slice(0, 16)}...</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/30">
                      {dev.accountCount} {dev.accountCount === 1 ? 'conta' : 'contas associadas'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    Plataforma: {dev.platform ?? '—'} | Visto em: {fmtDateShort(dev.lastSeenAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Trust Modal */}
      {trustModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-emerald-500/30 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <UserCheck className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white">Marcar Usuário como Confiável</h3>
              </div>
              <button
                type="button"
                onClick={() => setTrustModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Usuários confiáveis (whitelist) têm o score de risco mantido em 0, contornando bloqueios automáticos do motor antibot.
            </p>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase">Motivo (opcional):</label>
              <input
                type="text"
                placeholder="Ex.: Jogador verificado via suporte / streamer oficial"
                value={trustReason}
                onChange={(e) => setTrustReason(e.target.value)}
                maxLength={300}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/60"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setTrustModalOpen(false)}
                disabled={trusting}
                className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 text-xs font-bold text-slate-300 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleSetTrusted(true)}
                disabled={trusting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-emerald-500 bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white shadow-lg shadow-emerald-600/20 disabled:opacity-50"
              >
                {trusting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                Confirmar Confiança
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
