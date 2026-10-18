import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const postShopPurchasePart = vi.fn();
const postShopPurchase = vi.fn();
const fetchAll = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('../lib/shop.api', () => ({
  postShopPurchase,
  postShopPurchaseFan: vi.fn(),
  postShopPurchaseRack: vi.fn(),
  postShopPurchasePart,
}));
vi.mock('../../shell/lib/game.store', () => ({ useGameStore: () => ({ fetchAll }) }));
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('../../../shared/utils/reportApiFailure', () => ({ reportApiFailure: vi.fn() }));

const { useShopPurchase, MAX_SHOP_PART_QTY } = await import('../hooks/useShopPurchase');

const PART = { slug: 'asic_chip', rarity: 'rare', nameKey: 'parts.items.asic_chip', price: 0.05, currency: 'BLK' };

beforeEach(() => vi.clearAllMocks());

describe('useShopPurchase — peças', () => {
  it('compra a peça na rota de peça com slug, raridade e quantidade', async () => {
    postShopPurchasePart.mockResolvedValue({ data: { ok: true, messageKey: 'parts.purchase_success' } });
    const { result } = renderHook(() => useShopPurchase());
    act(() => result.current.openPartModal(PART));
    act(() => result.current.setQuantity(7));
    await act(() => result.current.confirmPurchase());

    expect(postShopPurchasePart).toHaveBeenCalledWith(expect.objectContaining({ slug: 'asic_chip', rarity: 'rare', quantity: 7 }));
    expect(postShopPurchase).not.toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith('parts.purchase_success');
    expect(fetchAll).toHaveBeenCalled();
    expect(result.current.modal).toBeNull();
  });

  it('peças podem ir até 100 por compra; acima disso é cortado', async () => {
    postShopPurchasePart.mockResolvedValue({ data: { ok: true } });
    const { result } = renderHook(() => useShopPurchase());
    act(() => result.current.openPartModal(PART));
    expect(result.current.maxQty).toBe(MAX_SHOP_PART_QTY);
    act(() => result.current.setQuantity(500));
    await act(() => result.current.confirmPurchase());
    expect(postShopPurchasePart).toHaveBeenCalledWith(expect.objectContaining({ quantity: 100 }));
  });

  it('saldo insuficiente mostra a mensagem do servidor e mantém o modal', async () => {
    const { AxiosError } = await import('axios');
    const err = new AxiosError('bad');
    // @ts-expect-error minimal response for the test
    err.response = { data: { ok: false, code: 'INSUFFICIENT_BALANCE', message: 'Saldo BLK insuficiente.' } };
    postShopPurchasePart.mockRejectedValue(err);
    const { result } = renderHook(() => useShopPurchase());
    act(() => result.current.openPartModal(PART));
    await act(() => result.current.confirmPurchase());
    expect(toastError).toHaveBeenCalledWith('Saldo BLK insuficiente.');
    expect(result.current.modal).not.toBeNull();
    expect(fetchAll).not.toHaveBeenCalled();
  });
});
