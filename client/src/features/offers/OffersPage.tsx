import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { useAuthStore } from '../../shared/auth/auth.store';
import { Loader2, Zap, TrendingUp, CheckCircle2, AlertTriangle, X, Sparkles, Calendar, Clock, Minus, Plus, Package, DoorOpen, Wind, Boxes } from 'lucide-react';
import { IconBadge, StatusPill } from '../../shared/components';
import { getActiveOfferEvents, postOfferEventPurchase, postOfferFanPurchase, postOfferRackPurchase, readActiveOffersCache, writeActiveOffersCache, clearActiveOffersCache, hasLiveRoomOffers, hasLiveGearOffers, OFFER_PURCHASE_MAX_QUANTITY, readGearMaxBulkQuantity, readOfferPurchaseError } from './lib/offers.api';
import type { OfferEventDTO, OfferEventMinerDTO, RoomOffersDTO, FanOffersDTO, FanOfferItemDTO, RackOffersDTO } from './lib/offers.api';
import { OfferMinerModel } from './components/OfferMinerModel';
import { ShowcaseRoomOnlyNotice } from '../machines/components/ShowcaseRoomOnlyNotice';
import { CoolingFanUnit } from '../inventory2/components/CoolingFanUnit';
import { RackCatalogArt } from '../inventory2/components/RackCatalogArt';
import { MiningRackShelf } from '../inventory2/components/MiningRackShelf';
import { postBuyRoom } from '../machines/lib/machines.api';
import { useGameStore } from '../shell/lib/game.store';
import { formatHashrate, apiErrorMessage } from '../machines/lib/machines.shared';
import { formatPrice } from '../../shared/utils/formatPrice';
import { useTranslation } from 'react-i18next';

const OFFER_DATE_LOCALE = 'pt-BR';

function FanOfferArt() {
    return <CoolingFanUnit spinning className="h-auto w-full max-w-md" />;
}

function RackOfferArt() {
    return <MiningRackShelf className="h-auto w-full max-w-md" />;
}

function upcomingSalesDate(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const at = new Date(iso).getTime();
    if (!Number.isFinite(at) || at <= Date.now()) return null;
    return iso;
}

function fmtDate(iso: string | null | undefined, localeTag: string) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString(localeTag, { day: '2-digit', month: '2-digit', year: 'numeric' })
        + ' ' + d.toLocaleTimeString(localeTag, { hour: '2-digit', minute: '2-digit' });
}

function getEventState(now: Date, event: OfferEventDTO) {
    const startsAt = event?.startsAt ? new Date(event.startsAt) : null;
    if (!startsAt) return event?.isLive ? 'live' : 'upcoming';
    return startsAt.getTime() > now.getTime() ? 'upcoming' : event?.isLive ? 'live' : 'ended';
}

type GearKind = 'fan' | 'rack';

/**
 * Ventilador e rack são a MESMA oferta com outra arte — `RackOffersDTO` e
 * `RackOfferItemDTO` já são aliases puros de fan (offers.api.ts). Antes daqui, as
 * duas seções e os dois modais eram blocos copiados byte-a-byte, e trocar um pelo
 * outro numa edição não quebrava nada visível.
 *
 * As classes ficam literais de propósito: o Tailwind não resolve nome de classe
 * montado em runtime, então `border-${accent}-500/20` sairia sem estilo.
 */
const GEAR = {
    fan: {
        Art: FanOfferArt,
        Icon: Wind,
        badgeKey: 'shop.fan_badge',
        purchase: postOfferFanPurchase,
        card: 'bg-surface border-2 border-cyan-500/30 hover:border-cyan-400/50 rounded-3xl p-6 sm:p-7 shadow-[4px_4px_0px_#000000] bg-slate-900/60 transition-all duration-300 group relative overflow-hidden',
        badge: 'px-3 py-1 rounded-full border bg-cyan-500/10 border-cyan-500/30 text-[9px] font-black uppercase tracking-widest text-cyan-300',
        icon: 'w-5 h-5 text-cyan-400',
    },
    rack: {
        Art: RackOfferArt,
        Icon: Boxes,
        badgeKey: 'shop.rack_badge',
        purchase: postOfferRackPurchase,
        card: 'bg-surface border-2 border-amber-500/30 hover:border-amber-400/50 rounded-3xl p-6 sm:p-7 shadow-[4px_4px_0px_#000000] bg-slate-900/60 transition-all duration-300 group relative overflow-hidden',
        badge: 'px-3 py-1 rounded-full border bg-amber-500/10 border-amber-500/30 text-[9px] font-black uppercase tracking-widest text-amber-300',
        icon: 'w-5 h-5 text-amber-400',
    },
} as const;

function GearOffersSection({ kind, offers, locale, buying, onBuy }: {
    kind: GearKind;
    offers: FanOffersDTO | null;
    locale: string;
    buying: boolean;
    onBuy: (kind: GearKind, item: FanOfferItemDTO) => void;
}) {
    const { t } = useTranslation();
    if (!hasLiveGearOffers(offers)) return null;
    const style = GEAR[kind];
    const Art = style.Art;
    const Icon = style.Icon;
    return (
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b-2 border-slate-800">
                    <div className="flex items-center gap-3">
                        <IconBadge icon={Icon} variant={kind === 'fan' ? 'sky' : 'amber'} size="md" />
                        <h2 className="text-lg sm:text-xl font-black text-white uppercase italic tracking-tight">{offers?.title}</h2>
                        {offers?.isPurchaseLive ? (
                            <StatusPill variant="success" label={t('offers.live')} />
                        ) : (
                            <StatusPill variant="warning" icon={Clock} label={t('offers.coming_soon')} />
                        )}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3 text-xs text-slate-400 font-medium">
                        {upcomingSalesDate(offers?.salesAvailableAt) && (
                            <div className="flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                                <span className="font-semibold text-slate-300">{t('shop.sales_opens_at')}:</span>
                                <span>{fmtDate(offers?.salesAvailableAt, locale)}</span>
                            </div>
                        )}
                    </div>
                </div>
                {offers?.description && (
                    <p className="text-sm text-slate-400 max-w-3xl font-medium">{offers.description}</p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {(offers?.items || []).map((item) => {
                        const purchaseLive = item.isPurchaseLive !== false && offers?.isPurchaseLive !== false;
                        const discountPercent = item.listPrice > 0
                            ? Math.round((1 - item.price / item.listPrice) * 100)
                            : 0;
                        return (
                            <div
                                key={item.sku}
                                className={style.card}
                            >
                                <div className="relative z-10 space-y-5">
                                    <div className="flex justify-between items-start">
                                        <div className={style.badge}>
                                            {discountPercent > 0
                                                ? t('offers.room_offer_badge', { percent: discountPercent })
                                                : t(style.badgeKey)}
                                        </div>
                                        <Icon className={style.icon} />
                                    </div>
                                    <div className="aspect-square bg-slate-950/60 rounded-2xl p-4 border border-slate-800 flex items-center justify-center overflow-hidden group-hover:scale-[1.02] transition-transform duration-300">
                                        {kind === 'rack' ? <RackCatalogArt imageUrl={item.imageUrl} /> : <Art />}
                                    </div>
                                    <div className="space-y-1">
                                        <h3 className="text-lg font-black text-white">{t(item.nameKey)}</h3>
                                        <p className="text-xs text-slate-400 font-medium">{t(item.descriptionKey)}</p>
                                    </div>
                                    <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between gap-4">
                                        <div className="flex flex-col">
                                            <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">{t('shop.price')}</span>
                                            <div className="flex items-baseline gap-2">
                                                {item.listPrice > item.price && (
                                                    <span className="text-sm font-bold text-slate-400 line-through">
                                                        {formatPrice(item.listPrice)} {item.currency}
                                                    </span>
                                                )}
                                                <span className="text-lg font-black text-white italic font-mono">
                                                    {formatPrice(item.price)}{' '}
                                                    <span className="text-xs font-bold text-slate-400 not-italic uppercase">{item.currency}</span>
                                                </span>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            disabled={!purchaseLive || buying}
                                            onClick={() => onBuy(kind, item)}
                                            className="px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-40 bg-primary hover:bg-primary-hover text-white outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                        >
                                            {purchaseLive ? t('offers.buy') : t('offers.coming_soon')}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
    );
}

export default function OffersPage() {
  const { t } = useTranslation();
    const offerDateLocale = OFFER_DATE_LOCALE;
    const authHydrated = useAuthStore((s) => s.authHydrated);
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const userId = useAuthStore((s) => s.user?.id);
    const { fetchAll } = useGameStore();
    const cached = readActiveOffersCache(userId);
    const [events, setEvents] = useState<OfferEventDTO[]>(() => cached?.events ?? []);
    const [roomOffers, setRoomOffers] = useState<RoomOffersDTO | null>(() => cached?.roomOffers ?? null);
    const [fanOffers, setFanOffers] = useState<FanOffersDTO | null>(() => cached?.fanOffers ?? null);
    const [rackOffers, setRackOffers] = useState<RackOffersDTO | null>(() => cached?.rackOffers ?? null);
    // Never blank the page on sidebar remount when we already have a successful cache.
    const [loading, setLoading] = useState(() => cached == null);
    const [modal, setModal] = useState<{ event: OfferEventDTO; miner: OfferEventMinerDTO } | null>(null);
    const [gearModal, setGearModal] = useState<{ kind: GearKind; item: FanOfferItemDTO } | null>(null);
    const [quantity, setQuantity] = useState(1);
    const [buying, setBuying] = useState(false);
    const [buyingRoom, setBuyingRoom] = useState(false);
    const MAX_QTY = OFFER_PURCHASE_MAX_QUANTITY;
    const now = new Date();
    const requestIdRef = useRef(0);
    const hasLoadedRef = useRef(cached != null);

    const load = useCallback(async (opts?: { replaceRooms?: boolean }) => {
        if (!authHydrated || !isAuthenticated) return;
        const requestId = ++requestIdRef.current;
        const firstPaint = !hasLoadedRef.current && readActiveOffersCache(userId) == null;
        try {
            if (firstPaint) setLoading(true);
            const res = await getActiveOfferEvents();
            if (requestId !== requestIdRef.current) return;
            const body = res.data;
            // Keep previous UI on non-ok / partial responses — avoids offers flashing away.
            if (!body?.ok) return;
            const nextEvents = body.events || [];
            let nextRooms = body.roomOffers ?? null;
            const nextFans = body.fanOffers ?? null;
            const nextRacks = body.rackOffers ?? null;
            // Soft refresh must not wipe live room cards on a flaky null; buy/unlock uses replaceRooms.
            if (!opts?.replaceRooms && nextRooms == null) {
                const prevRooms = readActiveOffersCache(userId)?.roomOffers ?? null;
                if (hasLiveRoomOffers(prevRooms)) nextRooms = prevRooms;
            }
            setEvents(nextEvents);
            setRoomOffers(nextRooms);
            setFanOffers(nextFans);
            setRackOffers(nextRacks);
            writeActiveOffersCache({ events: nextEvents, roomOffers: nextRooms, fanOffers: nextFans, rackOffers: nextRacks }, userId);
            hasLoadedRef.current = true;
        } catch (e) {
            if (requestId !== requestIdRef.current) return;
            console.error(e);
            toast.error(t('common.error'));
        } finally {
            if (requestId === requestIdRef.current) setLoading(false);
        }
        // Intentionally omit `t` — i18n identity churn must not refetch and flash the page.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authHydrated, isAuthenticated, userId]);

    const handleBuyRoom = async () => {
        if (buyingRoom) return;
        setBuyingRoom(true);
        try {
            const res = await postBuyRoom();
            if (res.data.ok) {
                toast.success(res.data.message || t('offers.room_unlock_ok'));
                fetchAll();
                void load({ replaceRooms: true });
            } else {
                toast.error(typeof res.data.message === 'string' ? res.data.message : t('common.error'));
            }
        } catch (err) {
            toast.error(apiErrorMessage(err, t('common.error')));
        } finally {
            setBuyingRoom(false);
        }
    };

    useEffect(() => {
        if (!authHydrated) return;
        if (!isAuthenticated) {
            clearActiveOffersCache();
            setEvents([]);
            setRoomOffers(null);
            setFanOffers(null);
            setRackOffers(null);
            setLoading(false);
            return;
        }
        void load();
    }, [authHydrated, isAuthenticated, load]);

    const openModal = (ev: OfferEventDTO, m: OfferEventMinerDTO) => {
        const claimLimit = m.claimLimitPerUser ?? 0;
        const effectivelyFree = m.isFree || Number(m.price) === 0;
        const maxQty = effectivelyFree && claimLimit > 0
            ? Math.max(0, claimLimit - (m.userClaimCount || 0))
            : MAX_QTY;
        setQuantity(Math.min(1, maxQty));
        setModal({ event: ev, miner: { ...m, effectivelyFree } });
    };

    const confirmBuy = async () => {
        if (!modal?.miner || buying) return;
        try {
            setBuying(true);
            const res = await postOfferEventPurchase({ eventMinerId: modal.miner.id, quantity });
            if (res.data.ok) {
                toast.success(res.data.message || t('offers.purchase_ok'));
                fetchAll();
                setModal(null);
                load();
            }
        } catch (err: unknown) {
            toast.error(readOfferPurchaseError(err, t('common.error'), t));
        } finally {
            setBuying(false);
        }
    };

    const openGearModal = (kind: GearKind, item: FanOfferItemDTO) => {
        setQuantity(1);
        setGearModal({ kind, item });
    };

    /** Fan e rack só diferem na função de API — antes eram dois handlers idênticos. */
    const confirmGearBuy = async () => {
        if (!gearModal || buying) return;
        try {
            setBuying(true);
            const res = await GEAR[gearModal.kind].purchase({ sku: gearModal.item.sku, quantity });
            if (res.data.ok) {
                const messageKey = res.data.messageKey;
                const params = res.data.messageParams;
                toast.success(
                    typeof messageKey === 'string' && messageKey
                        ? t(messageKey, params as Record<string, unknown>)
                        : res.data.message || t('offers.purchase_ok'),
                );
                fetchAll();
                setGearModal(null);
                load();
            }
        } catch (err: unknown) {
            toast.error(readOfferPurchaseError(err, t('common.error'), t));
        } finally {
            setBuying(false);
        }
    };

    const GearArt = gearModal ? GEAR[gearModal.kind].Art : FanOfferArt;
    const sectionMaxQty = gearModal
        ? readGearMaxBulkQuantity(gearModal.kind === 'fan' ? fanOffers : rackOffers)
        : OFFER_PURCHASE_MAX_QUANTITY;
    const itemMaxQty = gearModal?.item.maxQuantity;
    const gearMaxQty =
        itemMaxQty != null && Number.isInteger(itemMaxQty) && itemMaxQty >= 1
            ? Math.min(sectionMaxQty, itemMaxQty)
            : sectionMaxQty;

    const pageHeader = (
        <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">
                {t('offers.title')}
            </h1>
            <p className="max-w-3xl text-xs sm:text-sm text-slate-400 font-medium">
                {t('offers.subtitle')}
            </p>
        </div>
    );

    if (loading) {
        return (
            <div className="space-y-12 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {pageHeader}
                <div className="h-[45vh] flex flex-col items-center justify-center gap-4 rounded-3xl border-2 border-slate-800 bg-slate-900/60 shadow-[4px_4px_0px_#000000]">
                    <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                    <p className="text-slate-400 font-extrabold uppercase tracking-widest text-xs">{t('common.loading')}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-12 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {pageHeader}

            <GearOffersSection kind="fan" offers={fanOffers} locale={offerDateLocale} buying={buying} onBuy={openGearModal} />

            <GearOffersSection kind="rack" offers={rackOffers} locale={offerDateLocale} buying={buying} onBuy={openGearModal} />

            {hasLiveRoomOffers(roomOffers) && (
                <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b-2 border-slate-800">
                        <div className="flex items-center gap-3">
                            <IconBadge icon={DoorOpen} variant="primary" size="md" />
                            <h2 className="text-lg sm:text-xl font-black text-white uppercase italic tracking-tight">{roomOffers.title}</h2>
                            <StatusPill variant="success" label={t('offers.live')} />
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3 text-xs text-slate-400 font-medium">
                            <div className="flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                                <span className="font-semibold text-slate-300">{t('offers.start')}:</span>
                                <span>{fmtDate(roomOffers.startsAt, offerDateLocale)}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                                <span className="font-semibold text-slate-300">{t('offers.end')}:</span>
                                <span>{fmtDate(roomOffers.endsAt, offerDateLocale)}</span>
                            </div>
                        </div>
                    </div>
                    {roomOffers.description && (
                        <p className="text-sm text-slate-400 max-w-3xl font-medium">{roomOffers.description}</p>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {(roomOffers.rooms || []).map((room) => (
                            <div
                                key={room.roomNumber}
                                className="bg-surface border-2 border-slate-800 hover:border-slate-700 bg-slate-900/60 rounded-3xl p-6 sm:p-7 shadow-[4px_4px_0px_#000000] transition-all duration-300 group relative overflow-hidden"
                            >
                                <div className="relative z-10 space-y-5">
                                    <div className="flex justify-between items-start">
                                        <div className="px-3 py-1 rounded-full border bg-primary/10 border-primary/30 text-[9px] font-black uppercase tracking-widest text-primary">
                                            {t('offers.room_offer_badge', { percent: room.discountPercent })}
                                        </div>
                                        <div className="flex items-center gap-1.5 text-amber-400">
                                            <TrendingUp className="w-3.5 h-3.5" />
                                            <span className="text-[10px] font-bold uppercase tracking-widest">{t('offers.event')}</span>
                                        </div>
                                    </div>
                                    <div className="aspect-square bg-slate-950/60 rounded-2xl p-4 border border-slate-800 flex items-center justify-center overflow-hidden group-hover:scale-[1.02] transition-transform duration-300">
                                        {room.imageUrl ? (
                                            <img
                                                src={room.imageUrl}
                                                alt={t('offers.room_number', { room: room.roomNumber })}
                                                className="w-full h-full object-cover rounded-xl"
                                            />
                                        ) : (
                                            <DoorOpen className="w-16 h-16 text-primary/40 group-hover:text-primary/60 transition-colors" />
                                        )}
                                    </div>
                                    <div className="space-y-1">
                                        <h3 className="text-lg font-black text-white">{t('offers.room_number', { room: room.roomNumber })}</h3>
                                        <p className="text-xs text-slate-400 font-medium">{t('offers.room_offer_desc')}</p>
                                    </div>
                                    <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between gap-4">
                                        <div className="flex flex-col">
                                            <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">{t('shop.price')}</span>
                                            <div className="flex items-baseline gap-2">
                                                <span className="text-sm font-bold text-slate-400 line-through">
                                                    {formatPrice(room.listPrice)} {room.currency}
                                                </span>
                                                <span className="text-lg font-black text-white italic font-mono">
                                                    {formatPrice(room.price)}{' '}
                                                    <span className="text-xs font-bold text-slate-400 not-italic uppercase">{room.currency}</span>
                                                </span>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            disabled={buyingRoom}
                                            onClick={() => void handleBuyRoom()}
                                            className="px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-40 bg-primary hover:bg-primary-hover text-white outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                        >
                                            {buyingRoom ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                t('offers.room_unlock')
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            
            {events.map((ev: OfferEventDTO) => (
                <div key={ev.id} className="space-y-6">
                    {/* Cabeçalho do Evento */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b-2 border-slate-800">
                        <div className="flex items-center gap-3">
                            <IconBadge icon={Zap} variant="amber" size="md" />
                            <h2 className="text-lg sm:text-xl font-black text-white uppercase italic tracking-tight">{ev.title}</h2>
                            {getEventState(now, ev) === 'live' ? (
                                <StatusPill variant="success" label={t('offers.live')} />
                            ) : getEventState(now, ev) === 'upcoming' ? (
                                <StatusPill variant="warning" icon={Clock} label={t('offers.coming_soon')} />
                            ) : (
                                <StatusPill variant="neutral" icon={Clock} label={t('offers.ended')} />
                            )}
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3 text-xs text-slate-400 font-medium">
                            <div className="flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                                <span className="font-semibold text-slate-300">{t('offers.start')}:</span>
                                <span>{fmtDate(ev.startsAt, offerDateLocale)}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                                <span className="font-semibold text-slate-300">{t('offers.end')}:</span>
                                <span>{fmtDate(ev.endsAt, offerDateLocale)}</span>
                            </div>
                        </div>
                    </div>

                        {/* Miners Grid */}
                    {(ev.miners || []).length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
                            {(ev.miners || []).map((m: OfferEventMinerDTO) => {
                                const claimLimit = m.claimLimitPerUser ?? 0;
                                const effectivelyFree = m.isFree || Number(m.price) === 0;
                                const alreadyClaimed = effectivelyFree && claimLimit > 0 && (m.userClaimCount || 0) >= claimLimit;
                                const eventState = getEventState(now, ev);
                                const canCollect =
                                  eventState === 'live' &&
                                  m.inStock &&
                                  !alreadyClaimed &&
                                  m.onSale !== false;
                                return (
                                <div key={m.id} className={`bg-surface border-2 rounded-3xl shadow-[4px_4px_0px_#000000] bg-slate-900/60 transition-all duration-300 group relative overflow-hidden ${
                                    m.modelUrl ? 'md:col-span-2 p-6' : 'p-6 sm:p-7'
                                } ${
                                    effectivelyFree
                                        ? 'border-emerald-500/30 hover:border-emerald-400/50'
                                        : m.modelUrl
                                        ? 'border-cyan-400/35 hover:border-cyan-300/60 shadow-[0_0_20px_rgba(34,211,238,0.1),4px_4px_0px_#000000]'
                                        : 'border-slate-800 hover:border-slate-700'
                                }`}>
                                    <div className="relative z-10 space-y-5">
                                        <div className="flex justify-between items-start">
                                            <div className={`px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest transition-colors ${
                                                effectivelyFree
                                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                                    : 'bg-slate-800 border-slate-700 text-slate-300 group-hover:text-primary'
                                            }`}>
                                                {effectivelyFree ? t('offers.free_machine') : t('offers.limited_edition')}
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                {effectivelyFree ? (
                                                    <span className="flex items-center gap-1 px-3 py-1 bg-emerald-500/15 border border-emerald-500/30 rounded-full text-[9px] font-black text-emerald-400 uppercase tracking-widest">
                                                        {t('offers.free')}
                                                    </span>
                                                ) : (
                                                    <div className="flex items-center gap-1.5 text-amber-400">
                                                        <TrendingUp className="w-3.5 h-3.5" />
                                                        <span className="text-[10px] font-bold uppercase tracking-widest">{t('offers.event')}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Info free: limite por jogador */}
                                        {effectivelyFree && (
                                            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl px-4 py-3 space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">{t('offers.claim_limit_per_user')}</span>
                                                    <span className="text-xs font-black text-emerald-400">
                                                        {claimLimit === 0 ? t('offers.unlimited') : `${claimLimit}x`}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">{t('offers.your_claims')}</span>
                                                    <span className={`text-xs font-black ${alreadyClaimed ? 'text-slate-400' : 'text-emerald-400'}`}>
                                                        {claimLimit === 0
                                                            ? t('offers.claimed_count', { count: m.userClaimCount || 0 })
                                                            : `${m.userClaimCount || 0} / ${claimLimit}`
                                                        }
                                                    </span>
                                                </div>
                                                {alreadyClaimed && (
                                                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                                                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                                        {t('offers.claim_limit_reached')}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Estoque restante */}
                                        {m.remaining !== null && m.remaining !== undefined && (
                                            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold w-fit ${
                                                m.remaining === 0
                                                    ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                                    : m.remaining <= 5
                                                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                            }`}>
                                                <Package className="w-3 h-3" />
                                                {m.remaining === 0
                                                    ? t('offers.sold_out')
                                                    : t('offers.remaining_count', { count: m.remaining })
                                                }
                                            </div>
                                        )}

                                        <div className={m.modelUrl
                                            ? 'relative aspect-[3/2] min-h-[18rem] bg-slate-950 rounded-2xl border border-cyan-400/25 shadow-[0_0_30px_rgba(34,211,238,0.12)] flex items-center justify-center overflow-hidden'
                                            : 'aspect-square bg-slate-950/60 rounded-2xl p-2 border border-slate-800 group-hover:scale-105 transition-transform duration-300 flex items-center justify-center overflow-hidden'
                                        }>
                                            {m.modelUrl && (
                                                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(34,211,238,0.2),rgba(245,158,11,0.05)_40%,transparent_68%)]" />
                                            )}
                                            {m.modelUrl
                                                ? <div className="absolute inset-0 z-10"><OfferMinerModel featured src={m.modelUrl} alt={m.name || 'MinerCore'} /></div>
                                                : m.imageUrl
                                                ? <img src={m.imageUrl} alt={m.name} className="w-full h-full object-contain scale-105" />
                                                : <Zap className="w-16 h-16 text-amber-500/30" />
                                            }
                                        </div>
                                        {(m.pendingDeliveryAt || (m.releaseAt && m.onSale === false)) && (
                                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold w-fit bg-amber-500/10 text-amber-300 border border-amber-500/20">
                                                <Clock className="w-3 h-3" />
                                                {m.pendingDeliveryAt
                                                    ? t('offers.pending_arrival', { date: fmtDate(m.pendingDeliveryAt, offerDateLocale) })
                                                    : t('offers.releases_on', { date: fmtDate(m.releaseAt!, offerDateLocale) })}
                                            </div>
                                        )}

                                        <div className="space-y-1">
                                            <h3 className="text-lg font-black text-white truncate">{m.name}</h3>
                                            <ShowcaseRoomOnlyNotice machine={m} />
                                            <div className="flex items-center gap-2 text-primary font-bold">
                                                <Zap className="w-4 h-4" />
                                                <span className="text-sm font-mono">{formatHashrate(Number(m.hashRate) || 0)}</span>
                                            </div>
                                        </div>

                                        {/* Datas do evento no card */}
                                        <div className="bg-slate-950/60 rounded-xl px-3.5 py-2.5 border border-slate-800/80 space-y-1">
                                            <div className="flex items-center gap-2 text-[10px] text-slate-400 font-medium">
                                                <Clock className="w-3 h-3 shrink-0 text-slate-500" />
                                                <span className="font-bold text-slate-300">{t('offers.start')}:</span>
                                                <span>{fmtDate(ev.startsAt, offerDateLocale)}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-[10px] text-slate-400 font-medium">
                                                <Clock className="w-3 h-3 shrink-0 text-slate-500" />
                                                <span className="font-bold text-slate-300">{t('offers.end')}:</span>
                                                <span>{fmtDate(ev.endsAt, offerDateLocale)}</span>
                                            </div>
                                        </div>

                                        <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between">
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">{effectivelyFree ? 'Custo' : t('shop.price')}</span>
                                                {effectivelyFree ? (
                                                    <span className="text-lg font-black text-emerald-400 italic">{t('offers.free')}</span>
                                                ) : (
                                                    <span className="text-lg font-black text-white italic font-mono">
                                                        {formatPrice(m.price)}{' '}
                                                        <span className="text-xs font-bold text-slate-400 not-italic uppercase">{m.currency}</span>
                                                    </span>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                disabled={eventState !== 'live' || !m.inStock || alreadyClaimed || m.onSale === false}
                                                onClick={() => canCollect && openModal(ev, m)}
                                                className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                                                    effectivelyFree
                                                        ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
                                                        : 'bg-primary hover:bg-primary-hover text-white shadow-primary/20'
                                                }`}
                                            >
                                                {eventState === 'upcoming'
                                                    ? t('offers.coming_soon')
                                                    : eventState === 'ended'
                                                    ? t('offers.ended')
                                                    : alreadyClaimed
                                                    ? t('offers.claimed')
                                                    : !m.inStock
                                                    ? t('offers.sold_out')
                                                    : m.onSale === false
                                                    ? t('offers.buy_opens_later')
                                                    : effectivelyFree
                                                    ? t('offers.collect')
                                                    : t('offers.buy')}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            ))}

            {events.length === 0 && !hasLiveRoomOffers(roomOffers) && !hasLiveGearOffers(fanOffers) && !hasLiveGearOffers(rackOffers) && (
                <div className="rounded-3xl border-2 border-dashed border-slate-800 bg-slate-900/40 p-16 text-center text-slate-400 font-medium">
                    {t('offers.empty')}
                </div>
            )}

            {modal && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-slate-900 border-2 border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-[4px_4px_0px_#000000] animate-in zoom-in-95 duration-200 relative">
                        <div className="absolute top-0 right-0 p-5 z-10">
                            <button onClick={() => setModal(null)} aria-label={t('common.cancel')} className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-7 sm:p-8 text-center space-y-6">
                            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto border shadow-[2px_2px_0px_#000000] ${
                                modal.miner.effectivelyFree
                                    ? 'bg-emerald-500/10 border-emerald-500/25'
                                    : 'bg-primary/10 border-primary/25'
                            }`}>
                                <Sparkles className={`w-8 h-8 ${modal.miner.effectivelyFree ? 'text-emerald-400' : 'text-primary'}`} />
                            </div>
                            <div className="space-y-1.5">
                                <h3 className="text-xl font-black text-white uppercase italic tracking-tight">
                                    {modal.miner.effectivelyFree ? t('offers.collect_free_machine') : t('offers.confirm_title')}
                                </h3>
                                <p className="text-slate-400 text-xs sm:text-sm font-medium">
                                    {modal.miner.effectivelyFree
                                        ? t('offers.collect_free_desc')
                                        : t('offers.confirm_limited_desc')}
                                </p>
                            </div>
                            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-5 space-y-4">
                                <div className="flex items-center gap-4 text-left">
                                    <div className="w-24 h-24 bg-slate-900 rounded-xl p-1 border border-slate-800 flex items-center justify-center overflow-hidden">
                                        {modal.miner.modelUrl
                                            ? <OfferMinerModel src={modal.miner.modelUrl} alt={modal.miner.name || 'MinerCore'} />
                                            : modal.miner.imageUrl
                                            ? <img src={modal.miner.imageUrl} className="w-full h-full object-contain" alt="" />
                                            : <Zap className="w-8 h-8 text-amber-500/40" />
                                        }
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-white leading-none text-base">{modal.miner.name}</h4>
                                        <ShowcaseRoomOnlyNotice machine={modal.miner} />
                                        <span className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mt-2 block font-mono">
                                            {formatHashrate(Number(modal.miner.hashRate) || 0)}
                                        </span>
                                        {modal.miner.effectivelyFree && (
                                            <span className="text-[10px] font-black text-emerald-400 uppercase mt-1 block">{t('offers.free')}</span>
                                        )}
                                    </div>
                                </div>
                                <div className="h-[1px] bg-slate-800 w-full" />
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('offers.quantity')}</span>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setQuantity(q => Math.max(1, q - 1))}
                                            disabled={quantity <= 1}
                                            className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center disabled:opacity-30 transition-colors"
                                        >
                                            <Minus className="w-3.5 h-3.5" />
                                        </button>
                                        <span className="w-8 text-center font-black text-white text-sm">{quantity}</span>
                                        <button
                                            onClick={() => {
                                                const modalClaimLimit = modal.miner.claimLimitPerUser ?? 0;
                                                const maxQty = modal.miner.effectivelyFree && modalClaimLimit > 0
                                                    ? Math.max(0, modalClaimLimit - (modal.miner.userClaimCount || 0))
                                                    : MAX_QTY;
                                                setQuantity(q => Math.min(maxQty, q + 1));
                                            }}
                                            disabled={(() => {
                                                const modalClaimLimit = modal.miner.claimLimitPerUser ?? 0;
                                                return modal.miner.effectivelyFree
                                                    ? modalClaimLimit > 0 && quantity >= Math.max(0, modalClaimLimit - (modal.miner.userClaimCount || 0))
                                                    : quantity >= MAX_QTY;
                                            })()}
                                            className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center disabled:opacity-30 transition-colors"
                                        >
                                            <Plus className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                                <div className="h-[1px] bg-slate-800 w-full" />
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('offers.total')}</span>
                                    <div className="text-right">
                                        {modal.miner.effectivelyFree ? (
                                            <span className="text-xl font-black text-emerald-400 italic">{t('offers.free')}</span>
                                        ) : (
                                            <>
                                                <span className="text-xl font-black text-white italic font-mono">
                                                    {formatPrice(Number(modal.miner.price) * quantity)}{' '}
                                                    <span className="text-xs font-bold text-slate-400 not-italic uppercase">{modal.miner.currency}</span>
                                                </span>
                                                {quantity > 1 && <p className="text-[10px] text-slate-400 mt-0.5">{formatPrice(modal.miner.price)} x {quantity}</p>}
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col gap-2.5">
                                <button
                                    onClick={confirmBuy}
                                    disabled={buying}
                                    className={`w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-[2px_2px_0px_#000000] flex items-center justify-center gap-2 active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                                        modal.miner.effectivelyFree
                                            ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                                            : 'bg-primary hover:bg-primary-hover text-white'
                                    }`}
                                >
                                    {buying
                                        ? <Loader2 className="w-4 h-4 animate-spin" />
                                        : <><CheckCircle2 className="w-4 h-4" /> {modal.miner.effectivelyFree ? t('offers.confirm_collect') : t('offers.confirm_payment')}</>
                                    }
                                </button>
                                <button
                                    onClick={() => setModal(null)}
                                    disabled={buying}
                                    className="w-full py-2.5 text-slate-400 hover:text-white font-bold text-xs uppercase tracking-wider transition-colors disabled:opacity-50"
                                >
                                    {t('common.cancel')}
                                </button>
                            </div>
                            {!modal.miner.effectivelyFree && (
                                <div className="flex items-center justify-center gap-2 text-amber-400/80">
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    <span className="text-[9px] font-black uppercase tracking-widest">{t('offers.irreversible')}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {gearModal && createPortal(
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={() => { if (!buying) setGearModal(null); }}
                >
                    <div
                        className="bg-slate-900 border-2 border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-[4px_4px_0px_#000000] animate-in zoom-in-95 duration-200 relative"
                        onClick={(ev) => ev.stopPropagation()}
                    >
                        <div className="absolute top-0 right-0 p-5 z-10">
                            <button
                                type="button"
                                onClick={() => setGearModal(null)}
                                disabled={buying}
                                aria-label={t('common.cancel')}
                                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-40"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-7 sm:p-8 text-center space-y-6">
                            <div className="aspect-square max-h-36 mx-auto bg-slate-950/60 rounded-2xl p-4 border border-slate-800 flex items-center justify-center overflow-hidden">
                                {gearModal.kind === 'rack' ? (
                                    <RackCatalogArt imageUrl={gearModal.item.imageUrl} />
                                ) : (
                                    <GearArt />
                                )}
                            </div>
                            <div className="space-y-1.5">
                                <h3 className="text-xl font-black text-white uppercase italic tracking-tight">{t('offers.confirm_title')}</h3>
                                <p className="text-slate-400 text-xs sm:text-sm font-medium">{t(gearModal.item.nameKey)}</p>
                            </div>
                            <div className="space-y-4 bg-slate-950/60 rounded-2xl p-5 border border-slate-800">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('offers.quantity')}</span>
                                    <div className="flex items-center gap-2">
                                        <button type="button" disabled={buying || quantity <= 1} onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center disabled:opacity-30 transition-colors">
                                            <Minus className="w-3.5 h-3.5" />
                                        </button>
                                        <span className="w-8 text-center font-black text-white text-sm">{quantity}</span>
                                        <button type="button" disabled={buying || quantity >= gearMaxQty} onClick={() => setQuantity((q) => Math.min(gearMaxQty, q + 1))} className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center disabled:opacity-30 transition-colors">
                                            <Plus className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                                <div className="h-[1px] bg-slate-800 w-full" />
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('offers.total')}</span>
                                    <span className="text-xl font-black text-white italic font-mono">
                                        {formatPrice(gearModal.item.price * quantity)}{' '}
                                        <span className="text-xs font-bold text-slate-400 not-italic uppercase">{gearModal.item.currency}</span>
                                    </span>
                                </div>
                            </div>
                            <div className="flex flex-col gap-2.5">
                                <button
                                    onClick={() => void confirmGearBuy()}
                                    disabled={buying}
                                    className="w-full py-3.5 bg-primary hover:bg-primary-hover text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-[2px_2px_0px_#000000] flex items-center justify-center gap-2 active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                >
                                    {buying ? <Loader2 className="w-4 h-4 animate-spin" /> : t('offers.confirm_payment')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setGearModal(null)}
                                    disabled={buying}
                                    className="w-full py-2.5 text-slate-400 hover:text-white font-bold text-xs uppercase tracking-wider disabled:opacity-40 transition-colors"
                                >
                                    {t('common.cancel')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
