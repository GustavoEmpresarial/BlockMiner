import { useState } from 'react';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
    BookOpen, Cpu, Zap, Wallet, Gift, Youtube, Calendar, Link as LinkIcon,
    Trophy, Gamepad2, ChevronDown, ChevronUp, Shield, Coins, LayoutGrid,
    Server, TrendingUp, ArrowDownCircle, ArrowUpCircle, Hash,
    Star, AlertCircle, Info, CheckCircle2, Lock, Layers, Bolt,
    Crosshair, ListChecks, Globe, Sparkles, Receipt, Puzzle,
} from 'lucide-react';
import Card from '../../../shared/components/Card';
import IconBadge from '../../../shared/components/IconBadge';
import { useTranslation } from 'react-i18next';
import { FreePartsGuide } from '../../parts/components/FreePartsGuide';

interface SectionProps {
    id: string;
    icon: LucideIcon;
    color?: string;
    badge?: ReactNode;
    title: string;
    subtitle?: string;
    children: ReactNode;
}

export function Section({ id, icon: Icon, color = 'text-primary', badge, title, subtitle, children }: SectionProps) {
    return (
        <section id={id} className="space-y-4">
            <div className="flex items-start gap-4">
                <IconBadge icon={Icon} variant="primary" size="md" />
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-black text-white italic uppercase tracking-tight">{title}</h2>
                        {badge && (
                            <span className="px-2.5 py-0.5 bg-primary/10 border border-primary/25 rounded-full text-[9px] font-black text-primary uppercase tracking-widest">{badge}</span>
                        )}
                    </div>
                    {subtitle && <p className="text-sm text-slate-400 font-medium mt-0.5">{subtitle}</p>}
                </div>
            </div>
            <div className="ml-0 sm:ml-14">{children}</div>
        </section>
    );
}

interface InfoRowProps { label: string; value: ReactNode; valueClass?: string; }
export function InfoRow({ label, value, valueClass = 'text-white' }: InfoRowProps) {
    return (
        <div className="flex items-center justify-between py-2 border-b-2 border-slate-800 last:border-0">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">{label}</span>
            <span className={`text-xs font-black ${valueClass}`}>{value}</span>
        </div>
    );
}

interface PillProps { children: ReactNode; color?: string; }
export function Pill({ children, color = 'bg-primary/10 text-primary border-primary/20' }: PillProps) {
    return (
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest ${color}`}>
            {children}
        </span>
    );
}

interface AccordionProps { title: string; icon?: LucideIcon; children: ReactNode; }
export function Accordion({ title, icon: Icon, children }: AccordionProps) {
    const [open, setOpen] = useState(false);
    return (
        <div className="border-2 border-slate-800 bg-slate-900/60 rounded-2xl overflow-hidden shadow-[2px_2px_0px_#000000]">
            <button
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-800/40 transition-colors text-left outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => setOpen(o => !o)}
            >
                <div className="flex items-center gap-3">
                    {Icon && <Icon className="w-4 h-4 text-primary shrink-0" />}
                    <span className="text-sm font-black text-white uppercase tracking-tight">{title}</span>
                </div>
                {open ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
            </button>
            {open && (
                <div className="px-5 py-4 bg-slate-950/60 border-t-2 border-slate-800 space-y-3 text-sm text-slate-300 leading-relaxed font-medium">
                    {children}
                </div>
            )}
        </div>
    );
}

/**
 * Renders a manual string that carries inline markup (`*_html` keys). The markup comes only
 * from this repo's locale JSON (static, bundled) and is limited to <strong class="…">.
 */
function Rich({ k }: { k: string }) {
    const { t } = useTranslation();
    return <span dangerouslySetInnerHTML={{ __html: t(k) }} />;
}

function Bullet({ kind = 'ok', children }: { kind?: 'ok' | 'warn' | 'info'; children: ReactNode }) {
    const Icon = kind === 'warn' ? AlertCircle : kind === 'info' ? Info : CheckCircle2;
    const color = kind === 'warn' ? 'text-amber-400' : kind === 'info' ? 'text-blue-400' : 'text-emerald-400';
    return (
        <li className="flex items-start gap-2"><Icon className={`w-3.5 h-3.5 ${color} shrink-0 mt-0.5`} /><span>{children}</span></li>
    );
}

function LabeledBullet({ label, text, kind }: { label: string; text: string; kind?: 'ok' | 'warn' | 'info' }) {
    return (
        <Bullet kind={kind}><strong className="text-white">{label}</strong> {text}</Bullet>
    );
}

export function ManualCover() {
    const { t } = useTranslation();
    return (
        <Card overflowHidden className="relative mb-8 p-6 sm:p-10 border-slate-800 shadow-[4px_4px_0px_#000000]">
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute -top-12 left-1/4 w-72 h-72 bg-primary/10 rounded-full blur-[100px]" />
                <div className="absolute -bottom-8 right-0 w-48 h-48 bg-sky-500/10 rounded-full blur-[80px]" />
            </div>
            <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-6">
                <IconBadge icon={BookOpen} variant="primary" size="lg" />
                <div>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                        <h2 className="text-2xl sm:text-3xl font-black text-white italic uppercase tracking-tight">{t('manual.cover_title')}</h2>
                        <Pill>v2.1</Pill>
                    </div>
                    <p className="text-slate-400 font-medium max-w-xl text-sm leading-relaxed">{t('manual.cover_body')}</p>
                </div>
            </div>
        </Card>
    );
}

export function ManualIntroSection() {
    const { t } = useTranslation();
    return (
        <Section id="intro" icon={Info} title={t('manual.toc.intro')} badge={t('manual.badge_start')} subtitle={t('manual.intro_subtitle')}>
            <Card>
                <p className="text-sm text-gray-400 leading-relaxed mb-4"><Rich k="manual.intro.lead_html" /></p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                        { icon: Cpu,    n: 1, color: 'text-primary' },
                        { icon: Zap,    n: 2, color: 'text-amber-400' },
                        { icon: Wallet, n: 3, color: 'text-emerald-400' },
                    ].map(({ icon: Icon, n, color }) => (
                        <div key={n} className="flex items-start gap-3 p-3 bg-gray-800/30 rounded-xl border border-gray-700/30">
                            <Icon className={`w-4 h-4 ${color} shrink-0 mt-0.5`} />
                            <div>
                                <p className="text-xs font-black text-white">{t(`manual.intro.card${n}_label`)}</p>
                                <p className="text-[10px] text-gray-500 mt-0.5">{t(`manual.intro.card${n}_desc`)}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </Card>
        </Section>
    );
}

export function ManualEconomySection() {
    const { t } = useTranslation();
    return (
        <Section id="economia" icon={Coins} color="text-amber-400" title={t('manual.toc.economia')} subtitle={t('manual.economy_subtitle')}>
            <div className="space-y-3">
                <Card>
                    <p className="text-sm text-gray-400 leading-relaxed mb-5"><Rich k="manual.economy.lead_html" /></p>

                    <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest mb-3">{t('manual.economy.token_status_heading')}</p>
                    <div className="space-y-0 rounded-xl overflow-hidden border border-gray-800/50 mb-5">
                        {[
                            { coin: 'POL',  key: 'pol',  hl: 'text-primary',    statusColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
                            { coin: 'BLK',  key: 'blk',  hl: 'text-purple-400', statusColor: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
                            { coin: 'BTC',  key: 'btc',  hl: 'text-amber-400',  statusColor: 'bg-gray-700/30 text-gray-500 border-gray-700/40' },
                            { coin: 'ETH',  key: 'eth',  hl: 'text-blue-400',   statusColor: 'bg-gray-700/30 text-gray-500 border-gray-700/40' },
                            { coin: 'USDC', key: 'usdc', hl: 'text-sky-400',    statusColor: 'bg-gray-700/30 text-gray-500 border-gray-700/40' },
                            { coin: '...',  key: 'more', hl: 'text-gray-600',   statusColor: 'bg-gray-700/20 text-gray-600 border-gray-800/40' },
                        ].map(({ coin, key, hl, statusColor }) => (
                            <div key={coin} className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800/40 last:border-0 bg-gray-900/20 odd:bg-transparent">
                                <div className="flex items-center gap-2.5">
                                    <span className={`text-xs font-black w-10 shrink-0 ${hl}`}>{coin}</span>
                                    <span className="text-[10px] text-gray-600">{t(`manual.economy.tokens.${key}.desc`)}</span>
                                </div>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[9px] font-black uppercase tracking-widest shrink-0 ${statusColor}`}>{t(`manual.economy.tokens.${key}.status`)}</span>
                            </div>
                        ))}
                    </div>

                    <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest mb-3">{t('manual.economy.withdraw_heading')}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                        {[
                            { key: 'minimum',    color: 'text-primary',    bg: 'bg-primary/8 border-primary/20' },
                            { key: 'network',    color: 'text-purple-400', bg: 'bg-purple-500/8 border-purple-500/20' },
                            { key: 'processing', color: 'text-amber-400',  bg: 'bg-amber-500/8 border-amber-500/20' },
                            { key: 'deadline',   color: 'text-amber-400',  bg: 'bg-amber-500/8 border-amber-500/20' },
                        ].map(({ key, color, bg }) => (
                            <div key={key} className={`flex flex-col items-center text-center p-3 rounded-xl border ${bg}`}>
                                <span className="text-[8px] font-black text-gray-600 uppercase tracking-widest mb-1.5">{t(`manual.economy.withdraw.${key}_label`)}</span>
                                <span className={`text-xs font-black ${color} leading-tight`}>{t(`manual.economy.withdraw.${key}_value`)}</span>
                            </div>
                        ))}
                    </div>
                    <div className="space-y-2">
                        <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl flex gap-2">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-[10px] text-amber-500/80 leading-relaxed"><Rich k="manual.economy.alert_manual_html" /></p>
                        </div>
                        <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl flex gap-2">
                            <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                            <p className="text-[10px] text-blue-400/80 leading-relaxed">{t('manual.economy.info_support')}</p>
                        </div>
                    </div>
                </Card>
            </div>
        </Section>
    );
}

export function ManualInfrastructureSection() {
    const { t } = useTranslation();
    const room = 'manual.infra.mining_room.items';
    return (
        <Section id="infra" icon={Server} color="text-blue-400" title={t('manual.toc.infra')} subtitle={t('manual.infra_subtitle')}>
            <div className="space-y-4">
                <Card>
                    <p className="text-sm text-gray-400 leading-relaxed mb-4"><Rich k="manual.infra.lead_html" /></p>
                    <div className="grid grid-cols-3 gap-3 mb-4">
                        {[
                            { icon: Layers,     label: t('manual.infra.stats.rooms_label'), value: '4',  sub: t('manual.infra.stats.rooms_sub'), color: 'text-blue-400' },
                            { icon: LayoutGrid, label: 'Racks',                             value: '24', sub: t('manual.infra.stats.racks_sub'), color: 'text-primary' },
                            { icon: Hash,       label: 'Slots',                             value: '8',  sub: t('manual.infra.stats.slots_sub'), color: 'text-emerald-400' },
                        ].map(({ icon: Icon, label, value, sub, color }) => (
                            <div key={value} className="flex flex-col items-center text-center p-3 bg-gray-800/30 rounded-xl border border-gray-700/30">
                                <Icon className={`w-5 h-5 ${color} mb-2`} />
                                <span className={`text-2xl font-black ${color}`}>{value}</span>
                                <span className="text-[9px] font-black text-white uppercase tracking-wide mt-0.5">{label}</span>
                                <span className="text-[8px] text-gray-600">{sub}</span>
                            </div>
                        ))}
                    </div>
                    <div className="p-3 bg-primary/5 border border-primary/15 rounded-xl">
                        <p className="text-[10px] text-primary/80 font-bold"><Rich k="manual.infra.capacity_html" /></p>
                    </div>
                </Card>

                <div className="space-y-2">
                    <Accordion title={t('manual.acc_mining_room')} icon={Cpu}>
                        <p>{t('manual.infra.mining_room.intro')}</p>
                        <ul className="space-y-1.5 mt-2 text-[12px]">
                            {['install', 'rename', 'remove', 'clear', 'rooms'].map((k) => (
                                <LabeledBullet key={k} label={t(`${room}.${k}_label`)} text={t(`${room}.${k}_text`)} />
                            ))}
                        </ul>
                    </Accordion>
                    <Accordion title={t('manual.acc_double_slots')} icon={LayoutGrid}>
                        <p><Rich k="manual.infra.double_slots.intro_html" /></p>
                        <div className="flex gap-2 mt-3 flex-wrap">
                            <Pill color="bg-blue-500/10 text-blue-400 border-blue-500/20">{t('manual.infra.double_slots.pill_quantum')}</Pill>
                            <Pill color="bg-purple-500/10 text-purple-400 border-purple-500/20">{t('manual.infra.double_slots.pill_elite')}</Pill>
                            <Pill color="bg-primary/10 text-primary border-primary/20">{t('manual.infra.double_slots.pill_pro')}</Pill>
                            <Pill>{t('manual.infra.double_slots.pill_basic')}</Pill>
                        </div>
                    </Accordion>
                    <Accordion title={t('manual.acc_public_ranking')} icon={Trophy}>
                        <p><Rich k="manual.infra.public_ranking.intro_html" /></p>
                        <p className="mt-2"><Rich k="manual.infra.public_ranking.hashrate_html" /></p>
                    </Accordion>
                </div>
            </div>
        </Section>
    );
}

export function ManualMachinesSection() {
    const { t } = useTranslation();
    return (
        <Section id="maquinas" icon={Cpu} color="text-primary" title={t('manual.toc.maquinas')} subtitle={t('manual.machines_subtitle')}>
            <div className="space-y-3">
                <Card>
                    <p className="text-sm text-gray-400 leading-relaxed mb-4"><Rich k="manual.machines.lead_html" /></p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="p-4 bg-gray-800/30 rounded-xl border border-gray-700/30 space-y-2">
                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                <p className="text-xs font-black text-white uppercase tracking-widest">{t('manual.machines.single_title')}</p>
                            </div>
                            <p className="text-[11px] text-gray-500 leading-relaxed">{t('manual.machines.single_desc')}</p>
                            <div className="grid grid-cols-8 gap-1 mt-2">
                                {Array.from({ length: 8 }).map((_, i) => (
                                    <div key={i} className="aspect-square rounded bg-primary/30 border border-primary/50" />
                                ))}
                            </div>
                            <p className="text-[9px] text-gray-600 text-center">{t('manual.machines.single_caption')}</p>
                        </div>
                        <div className="p-4 bg-gray-800/30 rounded-xl border border-gray-700/30 space-y-2">
                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-2 h-2 rounded-full bg-amber-500" />
                                <p className="text-xs font-black text-white uppercase tracking-widest">{t('manual.machines.double_title')}</p>
                            </div>
                            <p className="text-[11px] text-gray-500 leading-relaxed">{t('manual.machines.double_desc')}</p>
                            <div className="grid grid-cols-8 gap-1 mt-2">
                                {Array.from({ length: 4 }).map((_, i) => (
                                    <div key={i} className="col-span-2 aspect-[2/1] rounded bg-amber-500/30 border border-amber-500/50" />
                                ))}
                            </div>
                            <p className="text-[9px] text-gray-600 text-center">{t('manual.machines.double_caption')}</p>
                        </div>
                    </div>
                </Card>
                <div className="p-3 bg-gray-800/30 border border-gray-700/30 rounded-xl flex gap-2">
                    <Info className="w-3.5 h-3.5 text-gray-500 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-gray-500 leading-relaxed">{t('manual.machines.info')}</p>
                </div>
            </div>
        </Section>
    );
}

export function ManualIncomeSection() {
    const { t } = useTranslation();
    const s = (k: string) => t(`manual.income.sources.${k}`);
    const items: { key: string; icon: LucideIcon; color: string; content: ReactNode }[] = [
        {
            key: 'passive', icon: Cpu, color: 'text-primary',
            content: (
                <>
                    <p><Rich k="manual.income.sources.passive.body_html" /></p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                        {(['processing', 'frequency'] as const).map((k) => (
                            <div key={k} className="p-2 bg-gray-800/40 rounded-lg text-center">
                                <p className="text-[9px] text-gray-600 uppercase tracking-widest">{s(`passive.${k}_label`)}</p>
                                <p className="text-xs font-black text-white mt-0.5">{s(`passive.${k}_value`)}</p>
                            </div>
                        ))}
                    </div>
                </>
            ),
        },
        {
            key: 'faucet', icon: Gift, color: 'text-amber-400',
            content: (
                <>
                    <p><Rich k="manual.income.sources.faucet.body_html" /></p>
                    <ul className="space-y-1.5 mt-2 text-[12px]">
                        <LabeledBullet label={s('faucet.cooldown_label')} text={s('faucet.cooldown_text')} />
                        <LabeledBullet label={s('faucet.prize_label')} text={s('faucet.prize_text')} />
                        <LabeledBullet label={s('faucet.permanent_label')} text={s('faucet.permanent_text')} />
                    </ul>
                </>
            ),
        },
        {
            key: 'youtube', icon: Youtube, color: 'text-red-400',
            content: (
                <>
                    <p>{s('youtube.body')}</p>
                    <ul className="space-y-1.5 mt-2 text-[12px]">
                        <LabeledBullet label={s('youtube.reward_label')} text={s('youtube.reward_text')} />
                        <LabeledBullet label={s('youtube.limit_label')} text={s('youtube.limit_text')} />
                        <Bullet kind="warn">{s('youtube.pause_warning')}</Bullet>
                        <LabeledBullet kind="info" label={s('youtube.error_label')} text={s('youtube.error_text')} />
                    </ul>
                </>
            ),
        },
        {
            key: 'auto_mining', icon: Bolt, color: 'text-blue-400',
            content: (
                <>
                    <p><Rich k="manual.income.sources.auto_mining.body_html" /></p>
                    <ul className="space-y-1.5 mt-2 text-[12px]">
                        <Bullet>{s('auto_mining.start_tip')}</Bullet>
                        <Bullet>{s('auto_mining.gpu_tip')}</Bullet>
                        <Bullet kind="warn">{s('auto_mining.tab_warning')}</Bullet>
                    </ul>
                </>
            ),
        },
        {
            key: 'checkin', icon: Calendar, color: 'text-emerald-400',
            content: (
                <>
                    <p>{s('checkin.body')}</p>
                    <ul className="space-y-1.5 mt-2 text-[12px]">
                        <LabeledBullet label={s('checkin.frequency_label')} text={s('checkin.frequency_text')} />
                        <Bullet>{s('checkin.streak')}</Bullet>
                        <Bullet><Rich k="manual.income.sources.checkin.tournaments_html" /></Bullet>
                    </ul>
                </>
            ),
        },
        {
            key: 'missions', icon: ListChecks, color: 'text-sky-400',
            content: (
                <>
                    <p><Rich k="manual.income.sources.missions.body_html" /></p>
                    <ul className="space-y-1.5 mt-2 text-[12px]">
                        <Bullet>{s('missions.reset')}</Bullet>
                        <Bullet>{s('missions.credit')}</Bullet>
                        <Bullet><Rich k="manual.income.sources.missions.tournaments_html" /></Bullet>
                    </ul>
                </>
            ),
        },
        {
            key: 'mini_pass', icon: Trophy, color: 'text-yellow-400',
            content: (
                <>
                    <p><Rich k="manual.income.sources.mini_pass.body_html" /></p>
                    <ul className="space-y-1.5 mt-2 text-[12px]">
                        <Bullet>{s('mini_pass.xp')}</Bullet>
                        <Bullet>{s('mini_pass.rewards')}</Bullet>
                        <Bullet kind="warn">{s('mini_pass.season_warning')}</Bullet>
                    </ul>
                </>
            ),
        },
        {
            key: 'shortlinks', icon: LinkIcon, color: 'text-purple-400',
            content: (
                <>
                    <p>{s('shortlinks.body')}</p>
                    <ul className="space-y-1.5 mt-2 text-[12px]">
                        <Bullet>{s('shortlinks.daily')}</Bullet>
                        <Bullet>{s('shortlinks.prize')}</Bullet>
                    </ul>
                </>
            ),
        },
        {
            key: 'offerwall_internal', icon: LayoutGrid, color: 'text-cyan-400',
            content: (
                <>
                    <p>{s('offerwall_internal.body')}</p>
                    <ul className="space-y-1.5 mt-2 text-[12px]">
                        <Bullet>{s('offerwall_internal.deadline')}</Bullet>
                        <Bullet>{s('offerwall_internal.rewards')}</Bullet>
                        <Bullet><Rich k="manual.income.sources.offerwall_internal.tournaments_html" /></Bullet>
                    </ul>
                </>
            ),
        },
        {
            key: 'offerwall_external', icon: Globe, color: 'text-teal-400',
            content: (
                <>
                    <p>{s('offerwall_external.body')}</p>
                    <ul className="space-y-1.5 mt-2 text-[12px]">
                        <Bullet>{s('offerwall_external.credit')}</Bullet>
                        <Bullet kind="warn">{s('offerwall_external.vpn_warning')}</Bullet>
                        <Bullet kind="info">{s('offerwall_external.support')}</Bullet>
                    </ul>
                </>
            ),
        },
        {
            key: 'read_earn', icon: Sparkles, color: 'text-violet-400',
            content: (
                <>
                    <p>{s('read_earn.body')}</p>
                    <ul className="space-y-1.5 mt-2 text-[12px]">
                        <Bullet>{s('read_earn.reward')}</Bullet>
                        <Bullet>{s('read_earn.limit')}</Bullet>
                    </ul>
                </>
            ),
        },
        {
            key: 'games', icon: Gamepad2, color: 'text-pink-400',
            content: <p><Rich k="manual.income.sources.games.body_html" /></p>,
        },
        {
            key: 'offers', icon: Star, color: 'text-amber-400',
            content: (
                <>
                    <p><Rich k="manual.income.sources.offers.body_html" /></p>
                    <ul className="space-y-1.5 mt-2 text-[12px]">
                        <Bullet kind="warn">{s('offers.expire')}</Bullet>
                        <Bullet>{s('offers.hashrate')}</Bullet>
                    </ul>
                </>
            ),
        },
    ];
    return (
        <Section id="renda" icon={TrendingUp} color="text-emerald-400" title={t('manual.toc.renda')} subtitle={t('manual.income_subtitle')}>
            <div className="space-y-3">
                {items.map(({ key, icon: Icon, color, content }) => (
                    <div key={key} className="bg-gray-900/60 border border-gray-800/60 rounded-2xl overflow-hidden">
                        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-800/40 bg-gray-900/40">
                            <Icon className={`w-4 h-4 ${color} shrink-0`} />
                            <span className="text-sm font-black text-white uppercase tracking-tight">{s(`${key}.title`)}</span>
                        </div>
                        <div className="px-5 py-4 text-sm text-gray-400 leading-relaxed">{content}</div>
                    </div>
                ))}
            </div>
        </Section>
    );
}

export function ManualPartsSection() {
    const { t } = useTranslation();
    return (
        <Section id="pecas" icon={Puzzle} title={t('manual.parts.title')} badge={t('manual.badge_new')} subtitle={t('manual.parts.subtitle')}>
            <div className="space-y-4">
                <Card>
                    <ol className="space-y-3 text-sm text-slate-300 leading-relaxed list-decimal pl-5">
                        <li>{t('manual.parts.step_drop')}</li>
                        <li>{t('manual.parts.step_fuse')}</li>
                        <li>{t('manual.parts.step_merge')}</li>
                        <li>{t('manual.parts.step_buy')}</li>
                    </ol>
                </Card>
                <FreePartsGuide showBuyHint={false} />
                <p className="text-xs text-slate-500">{t('manual.parts.offerwall_tiers')}</p>
            </div>
        </Section>
    );
}

export function ManualTournamentsSection() {
    const { t } = useTranslation();
    const tt = (k: string) => t(`manual.tournaments.${k}`);
    return (
        <Section id="torneios" icon={Crosshair} color="text-rose-400" title={t('manual.toc.torneios')} badge={t('manual.badge_new')} subtitle={t('manual.tournaments_subtitle')}>
            <div className="space-y-4">
                <Card>
                    <p className="text-sm text-gray-400 leading-relaxed mb-5"><Rich k="manual.tournaments.lead_html" /></p>

                    <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest mb-3">{tt('types_heading')}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
                        {[
                            { key: 'daily',   color: 'text-emerald-400', bg: 'bg-emerald-500/8 border-emerald-500/20' },
                            { key: 'weekly',  color: 'text-sky-400',     bg: 'bg-sky-500/8 border-sky-500/20' },
                            { key: 'monthly', color: 'text-violet-400',  bg: 'bg-violet-500/8 border-violet-500/20' },
                            { key: 'custom',  color: 'text-amber-400',   bg: 'bg-amber-500/8 border-amber-500/20' },
                        ].map(({ key, color, bg }) => (
                            <div key={key} className={`flex flex-col items-center text-center p-3 rounded-xl border ${bg}`}>
                                <span className={`text-sm font-black ${color}`}>{tt(`types.${key}_label`)}</span>
                                <span className="text-[9px] text-gray-600 mt-0.5">{tt(`types.${key}_sub`)}</span>
                            </div>
                        ))}
                    </div>

                    <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest mb-3">{tt('metrics_heading')}</p>
                    <div className="space-y-0 rounded-xl overflow-hidden border border-gray-800/50 mb-5">
                        {[
                            { key: 'hashrate', icon: Zap,        color: 'text-primary' },
                            { key: 'blocks',   icon: Cpu,        color: 'text-blue-400' },
                            { key: 'checkins', icon: Calendar,   color: 'text-emerald-400' },
                            { key: 'missions', icon: ListChecks, color: 'text-sky-400' },
                            { key: 'deposits', icon: Receipt,    color: 'text-amber-400' },
                        ].map(({ key, icon: Icon, color }) => (
                            <div key={key} className="flex items-center gap-3 px-4 py-3 border-b border-gray-800/40 last:border-0 bg-gray-900/20 odd:bg-transparent">
                                <Icon className={`w-3.5 h-3.5 ${color} shrink-0`} />
                                <div className="min-w-0">
                                    <p className={`text-xs font-black ${color}`}>{tt(`metric_names.${key}`)}</p>
                                    <p className="text-[10px] text-gray-600">{tt(`metrics.${key}`)}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest mb-3">{tt('prizes_heading')}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                        {[
                            { key: 'pol',     color: 'text-primary',     bg: 'bg-primary/8 border-primary/20' },
                            { key: 'blk',     color: 'text-purple-400',  bg: 'bg-purple-500/8 border-purple-500/20' },
                            { key: 'boost',   color: 'text-amber-400',   bg: 'bg-amber-500/8 border-amber-500/20' },
                            { key: 'machine', color: 'text-emerald-400', bg: 'bg-emerald-500/8 border-emerald-500/20' },
                        ].map(({ key, color, bg }) => (
                            <div key={key} className={`flex flex-col items-center text-center p-3 rounded-xl border ${bg}`}>
                                <span className={`text-xs font-black ${color}`}>{tt(`prizes.${key}_label`)}</span>
                                <span className="text-[9px] text-gray-600 mt-0.5 leading-snug">{tt(`prizes.${key}_sub`)}</span>
                            </div>
                        ))}
                    </div>

                    <div className="space-y-2">
                        <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl flex gap-2">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                            <p className="text-[10px] text-emerald-400/80 leading-relaxed"><Rich k="manual.tournaments.auto_join_html" /></p>
                        </div>
                        <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl flex gap-2">
                            <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                            <p className="text-[10px] text-blue-400/80 leading-relaxed">{tt('scores_info')}</p>
                        </div>
                        <div className="p-3 bg-primary/5 border border-primary/15 rounded-xl flex gap-2">
                            <Lock className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                            <p className="text-[10px] text-primary/80 leading-relaxed"><Rich k="manual.tournaments.tiers_html" /></p>
                        </div>
                    </div>
                </Card>

                <div className="space-y-2">
                    <Accordion title={t('manual.acc_track_placement')} icon={Crosshair}>
                        <p><Rich k="manual.tournaments.track.p1_html" /></p>
                        <p className="mt-2"><Rich k="manual.tournaments.track.p2_html" /></p>
                    </Accordion>
                    <Accordion title={t('manual.acc_tournament_history')} icon={Star}>
                        <p><Rich k="manual.tournaments.history_html" /></p>
                    </Accordion>
                </div>
            </div>
        </Section>
    );
}

export function ManualWalletSection() {
    const { t } = useTranslation();
    const steps = t('manual.wallet.connect_steps', { returnObjects: true });
    const connectSteps = Array.isArray(steps) ? (steps as string[]) : [];
    return (
        <Section id="carteira" icon={Wallet} color="text-emerald-400" title={t('manual.toc.carteira')} subtitle={t('manual.wallet_subtitle')}>
            <div className="space-y-3">
                <Card>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <ArrowDownCircle className="w-4 h-4 text-emerald-400" />
                                <p className="text-xs font-black text-white uppercase tracking-widest">{t('manual.wallet.deposit_title')}</p>
                            </div>
                            <ul className="space-y-1.5 text-[12px] text-gray-400">
                                <Bullet><Rich k="manual.wallet.deposit_items.nav_html" /></Bullet>
                                <Bullet>{t('manual.wallet.deposit_items.address')}</Bullet>
                                <Bullet><Rich k="manual.wallet.deposit_items.send_html" /></Bullet>
                                <Bullet>{t('manual.wallet.deposit_items.hash')}</Bullet>
                                <Bullet kind="warn">{t('manual.wallet.deposit_items.network_warning')}</Bullet>
                            </ul>
                        </div>
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <ArrowUpCircle className="w-4 h-4 text-primary" />
                                <p className="text-xs font-black text-white uppercase tracking-widest">{t('manual.wallet.withdraw_title')}</p>
                            </div>
                            <ul className="space-y-1.5 text-[12px] text-gray-400">
                                <Bullet>{t('manual.wallet.withdraw_items.connect')}</Bullet>
                                <Bullet>{t('manual.wallet.withdraw_items.amount')}</Bullet>
                                <Bullet><Rich k="manual.wallet.withdraw_items.manual_html" /></Bullet>
                                <Bullet kind="warn">{t('manual.wallet.withdraw_items.verify')}</Bullet>
                            </ul>
                        </div>
                    </div>
                    <div className="mt-4 p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl flex gap-2">
                        <Shield className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                        <p className="text-[10px] text-blue-400/80 leading-relaxed"><Rich k="manual.wallet.support_html" /></p>
                    </div>
                </Card>

                <Accordion title={t('manual.acc_connect_wallet')} icon={Wallet}>
                    <ol className="space-y-2 text-[12px] list-none">
                        {connectSteps.map((step, i) => (
                            <li key={i} className="flex items-start gap-3">
                                <span className="w-5 h-5 rounded-full bg-primary/20 border border-primary/30 text-primary text-[9px] font-black flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                                <span>{step}</span>
                            </li>
                        ))}
                    </ol>
                </Accordion>
            </div>
        </Section>
    );
}

export function ManualRankingSection() {
    const { t } = useTranslation();
    return (
        <Section id="ranking" icon={Trophy} color="text-amber-400" title={t('manual.toc.ranking')} subtitle={t('manual.ranking_subtitle')}>
            <Card>
                <p className="text-sm text-gray-400 leading-relaxed mb-4"><Rich k="manual.ranking.lead_html" /></p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                    {[
                        { key: 'machines',  icon: Cpu,      color: 'text-primary' },
                        { key: 'gamepower', icon: Gamepad2, color: 'text-pink-400' },
                        { key: 'youtube',   icon: Youtube,  color: 'text-red-400' },
                    ].map(({ key, icon: Icon, color }) => (
                        <div key={key} className="p-3 bg-gray-800/30 rounded-xl border border-gray-700/30 text-center">
                            <Icon className={`w-5 h-5 ${color} mx-auto mb-2`} />
                            <p className="text-xs font-black text-white">{t(`manual.ranking.sources.${key}_label`)}</p>
                            <p className="text-[10px] text-gray-500 mt-0.5">{t(`manual.ranking.sources.${key}_desc`)}</p>
                        </div>
                    ))}
                </div>
                {(['top3', 'public_room', 'locked_rooms'] as const).map((k) => (
                    <InfoRow key={k} label={t(`manual.ranking.info_rows.${k}_label`)} value={t(`manual.ranking.info_rows.${k}_value`)} />
                ))}
                <div className="mt-4 p-3 bg-gray-800/20 border border-gray-700/30 rounded-xl flex gap-2">
                    <Info className="w-3.5 h-3.5 text-gray-500 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-gray-500 leading-relaxed"><Rich k="manual.ranking.tip_html" /></p>
                </div>
            </Card>
        </Section>
    );
}

export function ManualFooter() {
    const { t } = useTranslation();
    return (
        <div className="flex items-center justify-center gap-2 py-3 px-5 bg-gray-900/30 border border-gray-800/30 rounded-2xl max-w-sm mx-auto">
            <Shield className="w-3 h-3 text-gray-700 shrink-0" />
            <p className="text-[9px] text-gray-600 font-bold uppercase tracking-widest text-center">{t('manual.footer')}</p>
        </div>
    );
}
