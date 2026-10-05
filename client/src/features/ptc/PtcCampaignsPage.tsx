import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
    Plus, Eye, PauseCircle, PlayCircle, Trash2, Edit3,
    ChevronDown, ChevronUp, Loader2, Clock, CheckCircle2,
    XCircle, AlertCircle, Layers
} from 'lucide-react';
import { api } from '../../shared/auth/auth.store';
import StatusPill from '../../shared/components/StatusPill';

interface Campaign {
    id: number;
    title: string;
    description: string;
    url: string;
    adType: 'iframe' | 'window';
    durationSeconds: number;
    status: 'pending_approval' | 'rejected' | 'active' | 'paused' | 'completed';
    rejectionReason: string | null;
    views: number;
    targetViews: number;
    costShib: string;
    rewardPerViewShib: string;
    createdAt: string;
    asset?: string;
}

interface PtcSettings {
    pricePerViewShib: string;
    rewardPerViewShib: string;
    minDurationSeconds: number;
    maxDurationSeconds: number;
    minViews: number;
    maxViews: number;
    isEnabled: boolean;
}

interface Tier {
    id: number;
    label: string;
    adType: 'window' | 'iframe';
    durationSeconds: number;
    pricePerViewShib: string;
    rewardPerViewShib: string;
    isActive: boolean;
    currency?: string;
}

const STATUS_CONFIG = {
    pending_approval: { labelKey: 'ptc.status_pending', icon: Clock, variant: 'warning' as const },
    rejected: { labelKey: 'ptc.status_rejected', icon: XCircle, variant: 'danger' as const },
    active: { labelKey: 'ptc.status_active', icon: CheckCircle2, variant: 'success' as const },
    paused: { labelKey: 'ptc.status_paused', icon: PauseCircle, variant: 'neutral' as const },
    completed: { labelKey: 'ptc.status_completed', icon: CheckCircle2, variant: 'info' as const },
};

export default function PtcCampaignsPage() {
    const { t } = useTranslation();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [settings, setSettings] = useState<PtcSettings | null>(null);
    const [tiers, setTiers] = useState<Tier[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [actionLoading, setActionLoading] = useState(false);

    // Create form
    const [form, setForm] = useState({
        title: '', description: '', url: '',
        tierId: 0, targetViews: 100,
    });

    // Edit form
    const [editForm, setEditForm] = useState({ title: '', description: '' });

    // Add/remove views
    const [viewsDelta, setViewsDelta] = useState<Record<number, string>>({});

    const fetchData = useCallback(async () => {
        try {
            const [camRes, setRes, tierRes] = await Promise.all([
                api.get('/ptc/my-campaigns'),
                api.get('/ptc/settings'),
                api.get('/ptc/tiers'),
            ]);
            setCampaigns(camRes.data.campaigns ?? []);
            setSettings(setRes.data.settings);
            const activeTiers: Tier[] = tierRes.data.tiers ?? [];
            setTiers(activeTiers);
            if (activeTiers.length > 0) {
                setForm((f) => ({ ...f, tierId: activeTiers[0].id }));
            }
        } catch {
            toast.error(t('ptc.campaigns_load_error'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => { fetchData(); }, [fetchData]);

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        if (!form.tierId) { toast.error(t('ptc.select_tier')); return; }
        setActionLoading(true);
        try {
            const res = await api.post('/ptc/campaigns', form);
            if (res.data.ok) {
                toast.success(t('ptc.campaign_submitted'));
                setShowCreate(false);
                setForm({ title: '', description: '', url: '', tierId: tiers[0]?.id ?? 0, targetViews: 100 });
                fetchData();
            } else {
                toast.error(res.data.message ?? t('common.error'));
            }
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
            toast.error(msg ?? t('ptc.campaign_create_error'));
        } finally {
            setActionLoading(false);
        }
    }

    async function toggleActive(c: Campaign) {
        const active = c.status === 'paused';
        try {
            await api.patch(`/ptc/campaigns/${c.id}`, { active });
            fetchData();
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
            toast.error(msg ?? t('common.error'));
        }
    }

    async function handleEdit(id: number) {
        setActionLoading(true);
        try {
            await api.patch(`/ptc/campaigns/${id}`, editForm);
            toast.success(t('ptc.campaign_updated'));
            setEditingId(null);
            fetchData();
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
            toast.error(msg ?? t('common.error'));
        } finally {
            setActionLoading(false);
        }
    }

    async function handleAddViews(id: number) {
        const views = Number(viewsDelta[id]);
        if (!views || views < 1) { toast.error(t('ptc.views_required')); return; }
        setActionLoading(true);
        try {
            const res = await api.post(`/ptc/campaigns/${id}/add-views`, { views });
            if (res.data.ok) { toast.success(t('ptc.views_added')); fetchData(); }
            else toast.error(res.data.message ?? t('common.error'));
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
            toast.error(msg ?? t('common.error'));
        } finally {
            setActionLoading(false);
        }
    }

    async function handleRemoveViews(id: number) {
        const views = Number(viewsDelta[id]);
        if (!views || views < 1) { toast.error(t('ptc.quantity_required')); return; }
        setActionLoading(true);
        try {
            const res = await api.post(`/ptc/campaigns/${id}/remove-views`, { views });
            if (res.data.ok) { toast.success(t('ptc.views_removed')); fetchData(); }
            else toast.error(res.data.message ?? t('common.error'));
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
            toast.error(msg ?? t('common.error'));
        } finally {
            setActionLoading(false);
        }
    }

    const selectedTier = tiers.find((t) => t.id === form.tierId) ?? null;
    const costPreview = selectedTier
        ? (Number(selectedTier.pricePerViewShib) * form.targetViews).toLocaleString(undefined, { maximumFractionDigits: 2 })
        : '...';

    const pageHeader = (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b-2 border-slate-800">
            <div>
                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight uppercase italic">{t('ptc.campaigns_title')}</h1>
                <p className="text-slate-400 text-xs sm:text-sm font-medium mt-1">{t('ptc.campaigns_subtitle')}</p>
            </div>
            <button
                onClick={() => setShowCreate(!showCreate)}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-orange-700 text-white font-black text-xs uppercase tracking-wider rounded-xl hover:bg-orange-600 active:translate-x-0.5 active:translate-y-0.5 transition-all shadow-[2px_2px_0px_#000000] outline-none focus-visible:ring-2 focus-visible:ring-primary shrink-0"
            >
                <Plus className="w-4 h-4" />
                {t('ptc.new_campaign')}
            </button>
        </div>
    );

    if (loading) return (
        <div className="space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {pageHeader}
            <div className="h-[45vh] flex flex-col items-center justify-center gap-4 rounded-3xl border-2 border-slate-800 bg-slate-900/60 shadow-[4px_4px_0px_#000000]">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-400 font-extrabold uppercase tracking-widest text-xs">{t('common.loading')}</p>
            </div>
        </div>
    );

    return (
        <div className="space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {pageHeader}

            {/* Create Form */}
            {showCreate && (
                <div className="bg-slate-900/60 border-2 border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-[4px_4px_0px_#000000]">
                    <h2 className="text-white font-black uppercase tracking-widest text-sm">{t('ptc.new_campaign')}</h2>
                    <form onSubmit={handleCreate} className="space-y-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">{t('ptc.field_title')}</label>
                                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required
                                    className="w-full bg-slate-950 border-2 border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500 transition-colors shadow-[2px_2px_0px_#000000]" placeholder={t('ptc.field_title_placeholder')} />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">{t('ptc.field_url')}</label>
                                <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} required type="url"
                                    className="w-full bg-slate-950 border-2 border-slate-700 rounded-xl px-4 py-3 text-white text-sm font-mono focus:outline-none focus:border-orange-500 transition-colors shadow-[2px_2px_0px_#000000]" placeholder="https://..." />
                                <p className="text-[9px] text-slate-500 mt-1 font-medium">{t('ptc.url_immutable_hint')}</p>
                            </div>
                        </div>

                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">{t('ptc.field_description')}</label>
                            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                                className="w-full bg-slate-950 border-2 border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500 transition-colors resize-none shadow-[2px_2px_0px_#000000]" rows={2} placeholder={t('ptc.field_description_placeholder')} />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">
                                    {t('ptc.catalog_option')}
                                </label>
                                {tiers.length === 0 ? (
                                    <div className="flex items-center gap-2 p-4 bg-amber-950/20 border-2 border-amber-500/30 rounded-xl shadow-[2px_2px_0px_#000000]">
                                        <Layers className="w-4 h-4 text-amber-400 shrink-0" />
                                        <p className="text-amber-300 text-xs font-medium">{t('ptc.no_tiers')}</p>
                                    </div>
                                ) : (
                                    <select value={form.tierId} onChange={(e) => setForm({ ...form, tierId: Number(e.target.value) })}
                                        className="w-full bg-slate-950 border-2 border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500 transition-colors shadow-[2px_2px_0px_#000000]">
                                        {tiers.map((tier) => (
                                            <option key={tier.id} value={tier.id}>
                                                {tier.label} — {tier.durationSeconds}s · {tier.adType} · {Number(tier.pricePerViewShib).toLocaleString(undefined, { maximumFractionDigits: 6 })} {tier.currency || 'SHIB'}/view
                                            </option>
                                        ))}
                                    </select>
                                )}
                                {selectedTier && (
                                    <p className="text-[10px] text-slate-400 mt-1.5 font-medium">
                                        {t('ptc.viewer_earns_prefix')}{' '}
                                        <span className="text-emerald-400 font-black font-mono">{Number(selectedTier.rewardPerViewShib).toLocaleString(undefined, { maximumFractionDigits: 6 })} {selectedTier.currency || 'SHIB'}</span>
                                        {t('ptc.viewer_earns_suffix')}
                                    </p>
                                )}
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">
                                    {t('ptc.views_label', { min: settings?.minViews.toLocaleString() })}
                                </label>
                                <input type="number" value={form.targetViews}
                                    min={settings?.minViews ?? 100} max={settings?.maxViews ?? 1000000}
                                    onChange={(e) => setForm({ ...form, targetViews: Number(e.target.value) })}
                                    className="w-full bg-slate-950 border-2 border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500 transition-colors shadow-[2px_2px_0px_#000000]" />
                            </div>
                        </div>

                        {/* Cost preview */}
                        <div className="flex items-center gap-3 p-4 bg-orange-950/20 border-2 border-orange-500/30 rounded-xl shadow-[2px_2px_0px_#000000]">
                            <img src={`/media/brand/${(selectedTier?.currency || 'shib').toLowerCase()}.webp`} alt="" className="w-5 h-5 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }} />
                            <div>
                                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{t('ptc.estimated_cost')}</p>
                                <p className="text-orange-300 font-black text-lg font-mono">{costPreview} {selectedTier?.currency || 'SHIB'}</p>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button type="submit" disabled={actionLoading}
                                className="flex-1 py-3.5 bg-orange-700 hover:bg-orange-600 active:translate-x-0.5 active:translate-y-0.5 text-white font-black uppercase tracking-wider text-xs rounded-xl transition-all shadow-[2px_2px_0px_#000000] disabled:opacity-50 flex items-center justify-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-primary">
                                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                {t('ptc.submit_for_approval')}
                            </button>
                            <button type="button" onClick={() => setShowCreate(false)}
                                className="px-6 py-3.5 bg-slate-800 hover:bg-slate-700 active:translate-x-0.5 active:translate-y-0.5 text-slate-200 font-black uppercase tracking-wider text-xs rounded-xl transition-all shadow-[2px_2px_0px_#000000] outline-none focus-visible:ring-2 focus-visible:ring-primary">
                                {t('common.cancel')}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Campaigns List */}
            {campaigns.length === 0 ? (
                <div className="bg-slate-900/60 border-2 border-slate-800 rounded-3xl p-14 text-center space-y-4 shadow-[4px_4px_0px_#000000]">
                    <div className="w-16 h-16 bg-slate-950/80 border border-slate-800 rounded-2xl flex items-center justify-center mx-auto shadow-[2px_2px_0px_#000000]">
                        <Eye className="w-8 h-8 text-slate-500" />
                    </div>
                    <p className="text-white font-black uppercase tracking-widest text-sm">{t('ptc.empty_campaigns_title')}</p>
                    <p className="text-slate-400 text-xs font-medium max-w-sm mx-auto">{t('ptc.empty_campaigns_hint')}</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {campaigns.map((c) => {
                        const cfg = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.pending_approval;
                        const StatusIcon = cfg.icon;
                        const pct = c.targetViews > 0 ? Math.min(100, Math.round((c.views / c.targetViews) * 100)) : 0;
                        const expanded = expandedId === c.id;
                        const editing = editingId === c.id;

                        return (
                            <div key={c.id} className="bg-slate-900/60 border-2 border-slate-800 rounded-2xl overflow-hidden shadow-[4px_4px_0px_#000000] transition-all">
                                {/* Header Row */}
                                <div className="p-5 sm:p-6 flex items-center gap-4 cursor-pointer hover:bg-slate-800/30 transition-colors" onClick={() => setExpandedId(expanded ? null : c.id)}>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                            <StatusPill variant={cfg.variant} icon={StatusIcon} label={t(cfg.labelKey)} className="!text-[9px] !px-2 !py-0.5" />
                                            <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest">{c.adType} · {c.durationSeconds}s</span>
                                        </div>
                                        <h3 className="text-white font-black text-sm uppercase italic tracking-tight truncate">{c.title}</h3>
                                        <p className="text-slate-400 text-xs font-mono truncate">{c.url}</p>
                                    </div>
                                    <div className="text-right shrink-0 space-y-1">
                                        <p className="text-[10px] text-slate-400 font-bold font-mono">{c.views.toLocaleString()} / {c.targetViews.toLocaleString()} views</p>
                                        <div className="flex items-center justify-end gap-1.5 font-mono">
                                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                                                c.asset === 'POL' ? 'bg-purple-950/40 text-purple-300 border border-purple-500/30' :
                                                c.asset === 'BLK' ? 'bg-amber-950/40 text-amber-300 border border-amber-500/30' :
                                                'bg-orange-950/40 text-orange-300 border border-orange-500/30'
                                            }`}>{c.asset || 'SHIB'}</span>
                                            <span className="text-orange-300 font-black text-xs">{Number(c.costShib).toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>
                                        </div>
                                    </div>
                                    {expanded ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                                </div>

                                {/* Progress bar */}
                                <div className="h-2 bg-slate-950 mx-5 sm:mx-6 rounded-full mb-2 overflow-hidden border border-slate-800">
                                    <div className="h-full bg-orange-500 rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(249,115,22,0.5)]" style={{ width: `${pct}%` }} />
                                </div>

                                {/* Expanded content */}
                                {expanded && (
                                    <div className="px-5 sm:px-6 pb-6 pt-4 space-y-5 border-t border-slate-800 bg-slate-950/40 mt-2">
                                        {c.rejectionReason && (
                                            <div className="flex gap-3 p-4 bg-red-950/20 border-2 border-red-500/30 rounded-xl shadow-[2px_2px_0px_#000000]">
                                                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                                <div>
                                                    <p className="text-red-400 font-black text-[9px] uppercase tracking-widest mb-1">{t('ptc.rejection_reason')}</p>
                                                    <p className="text-red-300/80 text-xs font-medium">{c.rejectionReason}</p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Actions */}
                                        {(c.status === 'active' || c.status === 'paused') && (
                                            <div className="flex flex-wrap gap-2.5">
                                                <button onClick={() => toggleActive(c)}
                                                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 active:translate-x-0.5 active:translate-y-0.5 text-white font-black text-[10px] uppercase tracking-wider rounded-xl transition-all shadow-[2px_2px_0px_#000000] outline-none focus-visible:ring-2 focus-visible:ring-primary">
                                                    {c.status === 'active' ? <PauseCircle className="w-3.5 h-3.5" /> : <PlayCircle className="w-3.5 h-3.5" />}
                                                    {c.status === 'active' ? t('ptc.pause') : t('ptc.reactivate')}
                                                </button>
                                                <button onClick={() => { setEditingId(c.id); setEditForm({ title: c.title, description: c.description }); }}
                                                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 active:translate-x-0.5 active:translate-y-0.5 text-white font-black text-[10px] uppercase tracking-wider rounded-xl transition-all shadow-[2px_2px_0px_#000000] outline-none focus-visible:ring-2 focus-visible:ring-primary">
                                                    <Edit3 className="w-3.5 h-3.5" /> {t('ptc.edit')}
                                                </button>
                                            </div>
                                        )}

                                        {/* Edit form */}
                                        {editing && (
                                            <div className="space-y-3 p-4 bg-slate-950/80 rounded-2xl border-2 border-slate-800 shadow-[2px_2px_0px_#000000]">
                                                <input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                                                    className="w-full bg-slate-900 border-2 border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500 transition-colors shadow-[2px_2px_0px_#000000]" placeholder={t('ptc.field_title')} />
                                                <textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                                                    className="w-full bg-slate-900 border-2 border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500 transition-colors resize-none shadow-[2px_2px_0px_#000000]" rows={2} placeholder={t('ptc.field_description_short')} />
                                                <div className="flex gap-2">
                                                    <button onClick={() => handleEdit(c.id)} disabled={actionLoading}
                                                        className="px-4 py-2 bg-orange-700 hover:bg-orange-600 active:translate-x-0.5 active:translate-y-0.5 text-white font-black text-[10px] uppercase tracking-wider rounded-xl transition-all shadow-[2px_2px_0px_#000000] disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-primary">
                                                        {t('common.save')}
                                                    </button>
                                                    <button onClick={() => setEditingId(null)}
                                                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 active:translate-x-0.5 active:translate-y-0.5 text-white font-black text-[10px] uppercase tracking-wider rounded-xl transition-all shadow-[2px_2px_0px_#000000] outline-none focus-visible:ring-2 focus-visible:ring-primary">
                                                        {t('common.cancel')}
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Add/Remove views */}
                                        {(c.status === 'active' || c.status === 'paused') && (
                                            <div className="space-y-2">
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('ptc.manage_views')}</p>
                                                <div className="flex flex-wrap gap-2 items-center">
                                                    <input type="number" min="1" placeholder={t('ptc.quantity_placeholder')}
                                                        value={viewsDelta[c.id] ?? ''}
                                                        onChange={(e) => setViewsDelta({ ...viewsDelta, [c.id]: e.target.value })}
                                                        className="w-36 bg-slate-950 border-2 border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500 transition-colors shadow-[2px_2px_0px_#000000]" />
                                                    <button onClick={() => handleAddViews(c.id)} disabled={actionLoading}
                                                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:translate-x-0.5 active:translate-y-0.5 text-white font-black text-[10px] uppercase tracking-wider rounded-xl transition-all shadow-[2px_2px_0px_#000000] disabled:opacity-50 flex items-center gap-1 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
                                                        <Plus className="w-3.5 h-3.5" /> {t('ptc.add')}
                                                    </button>
                                                    <button onClick={() => handleRemoveViews(c.id)} disabled={actionLoading}
                                                        className="px-4 py-2 bg-red-600 hover:bg-red-500 active:translate-x-0.5 active:translate-y-0.5 text-white font-black text-[10px] uppercase tracking-wider rounded-xl transition-all shadow-[2px_2px_0px_#000000] disabled:opacity-50 flex items-center gap-1 outline-none focus-visible:ring-2 focus-visible:ring-red-400">
                                                        <Trash2 className="w-3.5 h-3.5" /> {t('common.remove')}
                                                    </button>
                                                </div>
                                                {viewsDelta[c.id] && Number(viewsDelta[c.id]) > 0 && c.targetViews > 0 && (
                                                    <p className="text-[10px] text-slate-400 font-medium font-mono">
                                                        {t('ptc.extra_cost')}{' '}
                                                        <span className="text-orange-300 font-black">{(Number(viewsDelta[c.id]) * Number(c.costShib) / c.targetViews).toLocaleString(undefined, { maximumFractionDigits: 2 })} SHIB</span>
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            
        </div>
    );
}
