import type { Dispatch, SetStateAction } from 'react';
import { toast } from 'sonner';
import { api } from '../../../../shared/auth/auth.store';
import { readAxiosResponseMessage } from '../../lib/admin.api';
import type { BlkEconomyFormState } from '../adminFinance.types';

export interface AdminFinanceBlkTabProps {
    blkEconomyForm: BlkEconomyFormState | null;
    setBlkEconomyForm: Dispatch<SetStateAction<BlkEconomyFormState | null>>;
    saveBlkEconomy: () => void;
    fetchData: () => void;
}

/** BLK economy tab: emission + POL→BLK conversion settings and manual cycle run. Extracted from AdminFinancePage. */
export function AdminFinanceBlkTab({
    blkEconomyForm,
    setBlkEconomyForm,
    saveBlkEconomy,
    fetchData,
}: AdminFinanceBlkTabProps) {
    return (
                <div className="space-y-8">
                    {blkEconomyForm && (
                        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
                            <h3 className="text-sm font-black text-white uppercase tracking-widest">Economia BLK (1 BLK ≈ 1 USD)</h3>
                            <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                                BLK não é sacável — conversão POL → BLK, recompensa por tempo (pool) e uso interno (loja / perks).
                            </p>
                            <div className="flex flex-wrap gap-3 items-center pb-2 border-b border-slate-800/80">
                                <button
                                    type="button"
                                    onClick={async () => {
                                        if (!confirm('Disparar distribuição BLK do ciclo atual (idempotente)?')) return;
                                        try {
                                            const res = await api.post('/admin/mining/blk-cycle/run');
                                            if (res.data.ok) {
                                                const r = res.data.result || {};
                                                toast.success(
                                                    r.skipped
                                                        ? `Ciclo BLK: ${r.skipped}`
                                                        : `Ciclo BLK OK${r.cycleId != null ? ` #${r.cycleId}` : ''}`
                                                );
                                            }
                                            else toast.error('Falhou');
                                            fetchData();
                                        } catch (err: unknown) {
                                            toast.error(readAxiosResponseMessage(err) || 'Erro');
                                        }
                                    }}
                                    className="px-4 py-2 bg-cyan-700 hover:bg-cyan-600 text-white rounded-xl text-[10px] font-black uppercase"
                                >
                                    Rodar ciclo BLK agora
                                </button>
                                <span className="text-[9px] text-slate-600">Cron UTC a cada 10 min; manual usa a mesma janela.</span>
                            </div>
                            <h4 className="text-[10px] font-black text-cyan-500 uppercase tracking-widest pt-2">Emissão BLK (pool / 10 min)</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                                <label className="space-y-1">
                                    <span className="text-slate-500 font-bold">BLK / ciclo (base)</span>
                                    <input
                                        type="number"
                                        step="any"
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                                        value={blkEconomyForm.blkCycleReward}
                                        onChange={(e) => setBlkEconomyForm((p) => (p ? { ...p, blkCycleReward: e.target.value } : p))}
                                    />
                                </label>
                                <label className="space-y-1">
                                    <span className="text-slate-500 font-bold">Duração ciclo (s)</span>
                                    <input
                                        type="number"
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                                        value={blkEconomyForm.blkCycleIntervalSec}
                                        onChange={(e) => setBlkEconomyForm((p) => (p ? { ...p, blkCycleIntervalSec: e.target.value } : p))}
                                    />
                                </label>
                                <label className="space-y-1">
                                    <span className="text-slate-500 font-bold">Janela atividade (s)</span>
                                    <input
                                        type="number"
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                                        value={blkEconomyForm.blkCycleActivitySec}
                                        onChange={(e) => setBlkEconomyForm((p) => (p ? { ...p, blkCycleActivitySec: e.target.value } : p))}
                                    />
                                </label>
                                <label className="space-y-1">
                                    <span className="text-slate-500 font-bold">Hashrate mínimo</span>
                                    <input
                                        type="number"
                                        step="any"
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                                        value={blkEconomyForm.blkCycleMinHashrate}
                                        onChange={(e) => setBlkEconomyForm((p) => (p ? { ...p, blkCycleMinHashrate: e.target.value } : p))}
                                    />
                                </label>
                                <label className="space-y-1">
                                    <span className="text-slate-500 font-bold">Boost (multiplier)</span>
                                    <input
                                        type="number"
                                        step="any"
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                                        value={blkEconomyForm.blkCycleBoost}
                                        onChange={(e) => setBlkEconomyForm((p) => (p ? { ...p, blkCycleBoost: e.target.value } : p))}
                                    />
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer pt-6">
                                    <input
                                        type="checkbox"
                                        checked={blkEconomyForm.blkCyclePaused}
                                        onChange={(e) => setBlkEconomyForm((p) => (p ? { ...p, blkCyclePaused: e.target.checked } : p))}
                                        className="rounded border-slate-600"
                                    />
                                    <span className="text-slate-500 font-bold">Pausar emissão BLK</span>
                                </label>
                            </div>
                            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest pt-4">Conversão POL → BLK</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                                <label className="space-y-1">
                                    <span className="text-slate-500 font-bold">POL por 1 BLK</span>
                                    <input
                                        type="number"
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                                        value={blkEconomyForm.polPerBlk}
                                        onChange={(e) => setBlkEconomyForm((p) => (p ? { ...p, polPerBlk: e.target.value } : p))}
                                    />
                                </label>
                                <label className="space-y-1">
                                    <span className="text-slate-500 font-bold">Fee conversão (bps, 500 = 5%)</span>
                                    <input
                                        type="number"
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                                        value={blkEconomyForm.convertFeeBps}
                                        onChange={(e) => setBlkEconomyForm((p) => (p ? { ...p, convertFeeBps: e.target.value } : p))}
                                    />
                                </label>
                                <label className="space-y-1">
                                    <span className="text-slate-500 font-bold">Mín. POL conversão</span>
                                    <input
                                        type="number"
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                                        value={blkEconomyForm.minConvertPol}
                                        onChange={(e) => setBlkEconomyForm((p) => (p ? { ...p, minConvertPol: e.target.value } : p))}
                                    />
                                </label>
                                <label className="space-y-1">
                                    <span className="text-slate-500 font-bold">Cooldown conversão (s)</span>
                                    <input
                                        type="number"
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                                        value={blkEconomyForm.convertCooldownSec}
                                        onChange={(e) => setBlkEconomyForm((p) => (p ? { ...p, convertCooldownSec: e.target.value } : p))}
                                    />
                                </label>
                                <label className="space-y-1">
                                    <span className="text-slate-500 font-bold">Limite diário conversão (BLK, vazio = ∞)</span>
                                    <input
                                        type="number"
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                                        value={blkEconomyForm.dailyConvertLimitBlk}
                                        onChange={(e) => setBlkEconomyForm((p) => (p ? { ...p, dailyConvertLimitBlk: e.target.value } : p))}
                                        placeholder="∞"
                                    />
                                </label>
                            </div>
                            <button
                                type="button"
                                onClick={saveBlkEconomy}
                                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase"
                            >
                                Salvar economia BLK
                            </button>
                        </div>
                    )}
                </div>
    );
}
