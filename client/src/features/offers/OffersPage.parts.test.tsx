import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import ptBR from '../../i18n/locales/pt-BR.json';

/** Peças e kits em /offers: o card certo chama a rota certa, com a quantidade escolhida. */

const partPurchase = vi.fn();
const packPurchase = vi.fn();
const fanPurchase = vi.fn();
const getActive = vi.fn();
const fetchAll = vi.fn();

vi.mock('../../shared/auth/auth.store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector({ authHydrated: true, isAuthenticated: true }),
  api: { get: vi.fn(), post: vi.fn() },
}));
vi.mock('../shell/lib/game.store', () => ({ useGameStore: () => ({ fetchAll }) }));
vi.mock('../machines/lib/machines.api', () => ({ postBuyRoom: vi.fn() }));
vi.mock('./lib/offers.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/offers.api')>();
  return {
    ...actual,
    getActiveOfferEvents: getActive,
    postOfferFanPurchase: fanPurchase,
    postOfferPartPurchase: partPurchase,
    postOfferPartPackPurchase: packPurchase,
  };
});

const { clearActiveOffersCache } = await import('./lib/offers.api');
const { default: OffersPage } = await import('./OffersPage');

const i18n = i18next.createInstance();
await i18n.init({ lng: 'pt-BR', resources: { 'pt-BR': { translation: ptBR } }, interpolation: { escapeValue: false } });

const RARE_CHIP = {
  slug: 'asic_chip',
  rarity: 'rare',
  nameKey: 'parts.items.asic_chip',
  price: 0.038,
  listPrice: 0.05,
  currency: 'BLK',
  imageUrl: null,
};
const STARTER = {
  id: 'starter_pack',
  nameKey: 'parts.packs.starter_name',
  descriptionKey: 'parts.packs.starter_desc',
  price: 0.04,
  currency: 'BLK',
  badgeKey: 'parts.packs.starter_badge',
  items: [{ slug: 'power_cable', rarity: 'common', quantity: 5 }],
};

function body(partOffers: unknown) {
  return { data: { ok: true, events: [], roomOffers: null, fanOffers: null, rackOffers: null, partOffers } };
}

function renderPage() {
  return render(
    <I18nextProvider i18n={i18n}>
      <OffersPage />
    </I18nextProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  clearActiveOffersCache();
  getActive.mockResolvedValue(body({ isLive: true, currency: 'BLK', items: [RARE_CHIP], packs: [STARTER] }));
  partPurchase.mockResolvedValue({ data: { ok: true, messageKey: 'parts.purchase_success' } });
  packPurchase.mockResolvedValue({ data: { ok: true, messageKey: 'parts.packs.purchase_success' } });
});

afterEach(() => cleanup());

describe('OffersPage — peças', () => {
  it('mostra a seção de peças com desconto calculado e o kit', async () => {
    renderPage();
    expect(await screen.findByText(i18n.t('parts.offers.title'))).toBeInTheDocument();
    const card = screen.getByTestId('part-offer-asic_chip-rare');
    expect(within(card).getByText('-24%')).toBeInTheDocument();
    expect(within(screen.getByTestId('part-pack-starter_pack')).getByText(i18n.t('parts.packs.starter_name'))).toBeInTheDocument();
  });

  it('comprar uma peça chama a rota de peça com slug, raridade e quantidade', async () => {
    renderPage();
    const user = userEvent.setup();
    const card = await screen.findByTestId('part-offer-asic_chip-rare');
    await user.click(within(card).getByRole('button'));
    await user.click(screen.getByRole('button', { name: '+' }));
    await user.click(screen.getByText(i18n.t('offers.confirm_payment')));

    await waitFor(() => expect(partPurchase).toHaveBeenCalledWith({ slug: 'asic_chip', rarity: 'rare', quantity: 2 }));
    expect(packPurchase).not.toHaveBeenCalled();
    expect(fanPurchase).not.toHaveBeenCalled();
    await waitFor(() => expect(fetchAll).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('comprar um kit chama a rota de kit com o id certo', async () => {
    renderPage();
    const user = userEvent.setup();
    const pack = await screen.findByTestId('part-pack-starter_pack');
    await user.click(within(pack).getByRole('button'));
    expect(screen.queryByRole('button', { name: '+' })).not.toBeInTheDocument();
    await user.click(screen.getByText(i18n.t('offers.confirm_payment')));

    await waitFor(() => expect(packPurchase).toHaveBeenCalledWith({ packId: 'starter_pack' }));
    expect(partPurchase).not.toHaveBeenCalled();
  });

  it('erro da compra mantém o modal aberto e não recarrega saldo', async () => {
    partPurchase.mockRejectedValue(new Error('saldo'));
    renderPage();
    const user = userEvent.setup();
    const card = await screen.findByTestId('part-offer-asic_chip-rare');
    await user.click(within(card).getByRole('button'));
    await user.click(screen.getByText(i18n.t('offers.confirm_payment')));

    await waitFor(() => expect(partPurchase).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(fetchAll).not.toHaveBeenCalled();
  });

  it('sem partOffers (servidor antigo) a página continua sem a seção', async () => {
    getActive.mockResolvedValue(body(undefined));
    renderPage();
    expect(await screen.findByText(i18n.t('offers.empty'))).toBeInTheDocument();
    expect(screen.queryByText(i18n.t('parts.offers.title'))).not.toBeInTheDocument();
  });
});
