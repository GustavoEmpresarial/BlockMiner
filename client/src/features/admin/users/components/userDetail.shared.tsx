import type { AdminUserDetail, AdminUserMetrics } from '../adminUsers.types';
import { Calendar, Globe, Hash, Mail, ShieldAlert, ShieldCheck, User, Wallet, Cpu, DollarSign } from 'lucide-react';

export function UserProfileGrid(props: {
  user?: AdminUserDetail | null;
  detail?: AdminUserDetail | null;
  metrics?: AdminUserMetrics | null;
  loading?: boolean;
}) {
  const u = props.user ?? props.detail;
  const m = props.metrics;

  if (props.loading || !u) return null;

  return (
    <div className="space-y-4">
      {/* Basic Profile Card */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 font-bold">
              {u.username ? u.username[0].toUpperCase() : 'U'}
            </div>
            <div>
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                {u.username ?? u.name ?? `Usuário #${u.id}`}
                {u.isBanned ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
                    Banido
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Ativo
                  </span>
                )}
              </h4>
              <p className="text-xs text-slate-400">{u.email}</p>
            </div>
          </div>
          <span className="font-mono text-xs text-slate-500">ID #{u.id}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
              <Wallet className="w-3 h-3 text-emerald-400" />
              Carteira EVM
            </span>
            <p className="font-mono text-slate-300 truncate">{u.walletAddress || 'Não vinculada'}</p>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
              <Globe className="w-3 h-3 text-sky-400" />
              IP Cadastro / Atual
            </span>
            <p className="font-mono text-slate-300 truncate">
              {u.registrationIp || '—'} / {u.ip || '—'}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
              <Calendar className="w-3 h-3 text-slate-400" />
              Data de Cadastro
            </span>
            <p className="text-slate-300">
              {u.createdAt ? new Date(u.createdAt).toLocaleDateString('pt-BR') : '—'}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
              <Calendar className="w-3 h-3 text-slate-400" />
              Último Acesso
            </span>
            <p className="text-slate-300">
              {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('pt-BR') : 'Nunca acessou'}
            </p>
          </div>
        </div>
      </div>

      {/* Metrics Card */}
      {m && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Hashrate Real</span>
            <div className="text-base font-black text-amber-400 mt-1">{m.realHashRate ?? 0} TH/s</div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Máquinas Ativas</span>
            <div className="text-base font-black text-sky-400 mt-1">{m.activeMachines ?? 0}</div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Faucet Claims</span>
            <div className="text-base font-black text-purple-400 mt-1">{m.faucetClaims ?? 0}</div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Total Depositado</span>
            <div className="text-base font-black text-emerald-400 mt-1">{Number(m.totalDeposited ?? 0).toFixed(4)} POL</div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Total Sacado</span>
            <div className="text-base font-black text-slate-300 mt-1">{Number(m.totalWithdrawn ?? 0).toFixed(4)} POL</div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Transações</span>
            <div className="text-base font-black text-slate-300 mt-1">{m.totalTransactions ?? 0}</div>
          </div>
        </div>
      )}
    </div>
  );
}
