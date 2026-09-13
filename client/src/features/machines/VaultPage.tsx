import { useEffect, useCallback, useMemo, useState, useRef, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Shield, AlertCircle, Pickaxe } from 'lucide-react';
import { isAxiosError } from 'axios';
import { useGameStore } from '../shell/lib/game.store';
import { postRetrieveFromVault } from './lib/machines.api';
import { logVaultError } from './lib/vault.errors';
import { groupInventoryStacks, apiErrorMessage, safeDisplayLabel, formatHashrate } from './lib/machines.shared';
import { getMachineDisplayImageUrl } from './lib/machineDisplayImage';
import { MachineImage } from './components/MachineImage';
import { MachineQuantityModal } from './components/machines.quantityModal';
import type { BackpackItem, InventoryStackGroup } from './lib/machines.types';

function isVaultRow(row: unknown): row is BackpackItem {
  if (row == null || typeof row !== 'object' || !('id' in row)) return false;
  const id = Number((row as { id: unknown }).id);
  return Number.isInteger(id) && id > 0;
}

/** Shared page chrome so loading, error, and content states stay visually consistent. */
function VaultPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500 text-white">
      {children}
    </div>
  );
}

/**
 * "Armazém" (Cofre) screen — ported from legacy/client/src/pages/vault/VaultPage.tsx.
 * Was previously unported: MachinesPage already had "Ir para o Armazém" buttons wired to
 * navigate('/vault'), but no route/page existed for it, so users hit the app's catch-all
 * redirect (back to "/") instead of a real page — reported as "dá erro quando vai entrar".
 *
 * BACKEND WIRING (verified against current/server/modules/wallet/vault):
 *  - GET /api/vault                     → vaultRouter "/" — real (game.store.fetchVault).
 *  - POST /api/vault/retrieve-from-vault → vaultRouter "/retrieve-from-vault" — real.
 *
 * DEVIATION from legacy: legacy used a separate shared/hooks/useVault.ts + shared/components/
 * MachineCard.tsx. current/client has no shared/components equivalent (module self-containment
 * doctrine, same as machines.parts.tsx), so retrieval calls machines.api.ts directly and cards
 * reuse this module's own MachineImage/formatHashrate helpers instead of porting MachineCard.
 */
export default function VaultPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const vaultItems = useGameStore((s) => s.vaultItems);
  const vaultLoading = useGameStore((s) => s.vaultLoading);
  const vaultError = useGameStore((s) => s.vaultError);
  const fetchVault = useGameStore((s) => s.fetchVault);
  const fetchMachines = useGameStore((s) => s.fetchMachines);
  const fetchInventory = useGameStore((s) => s.fetchInventory);
  const [retrieving, setRetrieving] = useState(false);
  const [vaultQtyModalGroup, setVaultQtyModalGroup] = useState<InventoryStackGroup | null>(null);
  const retrieveLock = useRef(false);
  const fetchVaultLock = useRef(false);

  useEffect(() => {
    void fetchVault();
  }, [fetchVault]);

  const vaultRows = useMemo(() => {
    const raw = Array.isArray(vaultItems) ? vaultItems : [];
    return raw.filter(isVaultRow);
  }, [vaultItems]);

  const groupedVault = useMemo(() => groupInventoryStacks(vaultRows), [vaultRows]);

  const totalVaultUnits = useMemo(
    () => groupedVault.reduce((sum, g) => sum + g.quantity, 0),
    [groupedVault],
  );

  const handleConfirmRetrieveQty = useCallback(
    async (qtyRaw: number) => {
      const group = vaultQtyModalGroup;
      if (!group || retrieveLock.current) return;
      const qty = Math.min(Math.max(1, Math.floor(Number(qtyRaw)) || 1), group.quantity);
      const sorted = [...group.items].sort((a, b) => a.id - b.id);
      const ids = sorted.slice(0, qty).map((r) => r.id).filter((id) => Number.isInteger(id) && id > 0);
      if (ids.length === 0) {
        toast.error(t('common.error'));
        return;
      }
      retrieveLock.current = true;
      setRetrieving(true);
      try {
        await postRetrieveFromVault({ destination: 'inventory', vaultIds: ids });
        toast.success(
          ids.length > 1 ? t('vault.retrieve_bulk_success', { count: ids.length }) : t('vault.retrieve_success'),
        );
        setVaultQtyModalGroup(null);
        await Promise.all([fetchVault(), fetchMachines(), fetchInventory()]);
      } catch (error) {
        logVaultError('VAULT_RETRIEVE_FAILED', error);
        let apiCode: string | undefined;
        if (isAxiosError(error) && error.response?.data && typeof error.response.data === 'object') {
          const d = error.response.data as { code?: unknown };
          if (typeof d.code === 'string') apiCode = d.code;
        }
        if (apiCode) {
          const key = `vault.errors.${apiCode}`;
          const translated = t(key);
          if (translated !== key) {
            toast.error(translated);
            return;
          }
        }
        toast.error(apiErrorMessage(error, t('vault.retrieve_error')));
      } finally {
        retrieveLock.current = false;
        setRetrieving(false);
      }
    },
    [vaultQtyModalGroup, t, fetchVault, fetchMachines, fetchInventory],
  );

  const navToMiningRoom = useCallback(() => navigate('/inventory'), [navigate]);

  const handleRetryFetch = useCallback(() => {
    if (fetchVaultLock.current) return;
    fetchVaultLock.current = true;
    void (async () => {
      try {
        await fetchVault();
      } finally {
        fetchVaultLock.current = false;
      }
    })();
  }, [fetchVault]);

  const headerNav = (
    <nav className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
      <button
        type="button"
        onClick={navToMiningRoom}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-gray-700/60 bg-gray-800/40 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-gray-200 transition-colors hover:border-primary/40 hover:bg-gray-800/70 sm:w-auto"
      >
        <Pickaxe className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="text-center leading-snug">{t('vault.nav_back_mining_room')}</span>
      </button>
    </nav>
  );

  const header = (
    <header className="flex flex-col gap-4 border-b border-gray-800/40 pb-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <Shield className="h-8 w-8 shrink-0 text-primary" aria-hidden />
        <h1 className="text-2xl font-black tracking-tight text-white">{t('vault.title')}</h1>
      </div>
      {headerNav}
    </header>
  );

  if (vaultLoading && vaultRows.length === 0) {
    return (
      <VaultPageShell>
        {header}
        <div className="flex min-h-[320px] items-center justify-center rounded-3xl border border-gray-800/40 bg-surface p-8">
          <div className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
            <p className="text-sm text-gray-400">{t('vault.loading')}</p>
          </div>
        </div>
      </VaultPageShell>
    );
  }

  if (vaultError && vaultRows.length === 0) {
    return (
      <VaultPageShell>
        {header}
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-3xl border border-gray-800/40 bg-surface p-8 text-center">
          <AlertCircle className="h-14 w-14 shrink-0 text-amber-500" aria-hidden />
          <p className="max-w-md text-sm text-gray-300">{t('vault.error_loading')}</p>
          <button
            type="button"
            onClick={handleRetryFetch}
            className="min-h-11 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-white hover:bg-primary/90"
          >
            {t('vault.retry')}
          </button>
        </div>
      </VaultPageShell>
    );
  }

  return (
    <VaultPageShell>
      <MachineQuantityModal
        open={Boolean(vaultQtyModalGroup)}
        onClose={() => !retrieving && setVaultQtyModalGroup(null)}
        title={t('vault.quantity_modal_title')}
        subtitle={t('vault.quantity_modal_subtitle')}
        quantityLabel={t('vault.quantity_field')}
        max={vaultQtyModalGroup?.quantity ?? 1}
        min={1}
        confirmLabel={t('vault.quantity_confirm')}
        cancelLabel={t('common.cancel')}
        busy={retrieving}
        onConfirm={(q: number) => void handleConfirmRetrieveQty(q)}
      />

      <header className="flex flex-col gap-4 border-b border-gray-800/40 pb-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <Shield className="h-8 w-8 shrink-0 text-primary" aria-hidden />
            <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">{t('vault.title')}</h1>
          </div>
          <p className="max-w-2xl text-sm font-medium text-gray-500 sm:text-base">{t('vault.subtitle')}</p>
        </div>
        {headerNav}
      </header>

      {vaultRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-6 rounded-3xl border border-dashed border-gray-800/60 bg-surface px-6 py-16 text-center">
          <Shield className="mx-auto h-16 w-16 text-gray-600" aria-hidden />
          <div className="space-y-2">
            <h2 className="text-lg font-bold text-gray-300">{t('vault.empty')}</h2>
            <p className="mx-auto max-w-md text-sm text-gray-500">{t('vault.empty_hint')}</p>
          </div>
          <button
            type="button"
            onClick={navToMiningRoom}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3 text-xs font-black uppercase tracking-wider text-black shadow-glow transition-opacity hover:opacity-90"
          >
            <Pickaxe className="h-4 w-4 shrink-0" aria-hidden />
            {t('vault.empty_cta')}
          </button>
        </div>
      ) : (
        <>
          <h2 className="text-base font-bold text-gray-300 sm:text-lg">
            {t('vault.stored_machines')} ({totalVaultUnits})
          </h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 sm:gap-5">
            {groupedVault.map((group) => {
              const imageUrl = getMachineDisplayImageUrl({ imageUrl: group.imageUrl, imageSource: group.imageSource });
              const name = safeDisplayLabel(group.minerName);
              return (
                <div
                  key={`${name}|${group.level}|${group.hashRate}|${group.slotSize}`}
                  className="flex flex-col gap-3 rounded-2xl border border-gray-800/50 bg-gray-800/30 p-4 transition-colors hover:border-gray-700"
                >
                  <div className="grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-3">
                    <div className="relative h-14 w-14 shrink-0 rounded-xl border border-gray-800/50 bg-gray-900/50 p-2">
                      <MachineImage imageUrl={imageUrl} name={name} className="h-full w-full object-contain" />
                      {group.quantity > 1 && (
                        <div className="absolute -right-2 -top-2 z-[1] rounded-full border border-primary/20 bg-primary px-2 py-0.5 text-[10px] font-bold text-white shadow-lg">
                          x{group.quantity}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="break-words text-sm font-bold leading-snug text-white">{name}</h4>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                        <span className="shrink-0 whitespace-nowrap">Lv. {group.level}</span>
                        <span aria-hidden>·</span>
                        <span className="font-black text-primary">{formatHashrate(group.hashRate)}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={retrieving}
                    onClick={() => {
                      if (retrieveLock.current || retrieving) return;
                      setVaultQtyModalGroup(group);
                    }}
                    className="mt-auto inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-primary/15 px-3 py-2 text-[11px] font-black uppercase tracking-wider text-primary transition-colors hover:bg-primary/25 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t('vault.retrieve_from_vault')}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </VaultPageShell>
  );
}
