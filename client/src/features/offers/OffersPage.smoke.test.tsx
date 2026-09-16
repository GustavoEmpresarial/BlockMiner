import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import ptBR from '../../i18n/locales/pt-BR.json';

/**
 * Rede de segurança da /offers, que não tinha teste nenhum.
 *
 * O alvo é o que o refactor de deduplicação mexe: as seções e os modais de fan e
 * rack eram blocos copiados byte-a-byte, e confirmFanBuy/confirmRackBuy diferiam
 * só na função de API chamada. Se a unificação trocar um pelo outro, estes testes
 * quebram — é exatamente o erro que ninguém pegaria na revisão.
 */

const fanPurchase = vi.fn();
const rackPurchase = vi.fn();
const eventPurchase = vi.fn();
const getActive = vi.fn();
const fetchAll = vi.fn();

vi.mock('../../shared/auth/auth.store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ authHydrated: true, isAuthenticated: true }),
  api: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('../shell/lib/game.store', () => ({
  useGameStore: () => ({ fetchAll }),
}));

vi.mock('../machines/lib/machines.api', () => ({
  postBuyRoom: vi.fn(async () => ({ data: { ok: true, message: 'sala' } })),
}));

vi.mock('./lib/offers.api', async (importOriginal) => {
  // Mantém o cache real (estado de módulo) e troca só a camada de rede.
  const actual = await importOriginal<typeof import('./lib/offers.api')>();
  return {
    ...actual,
    getActiveOfferEvents: getActive,
    postOfferEventPurchase: eventPurchase,
    postOfferFanPurchase: fanPurchase,
    postOfferRackPurchase: rackPurchase,
  };
});

const { clearActiveOffersCache, writeActiveOffersCache } = await import('./lib/offers.api');
const { default: OffersPage } = await import('./OffersPage');

const i18n = i18next.createInstance();
await i18n.init({
  lng: 'pt-BR',
  resources: { 'pt-BR': { translation: ptBR } },
  interpolation: { escapeValue: false },
});

const FAN = {
  sku: 'FAN_BASIC',
  nameKey: 'fans.cooling_system_name',
  descriptionKey: 'fans.cooling_system_desc',
  price: 10,
  listPrice: 20,
  currency: 'BLK',
  isPurchaseLive: true,
};
const RACK = {
  sku: 'RACK_BASIC',
  nameKey: 'racks.mining_rack_name',
  descriptionKey: 'racks.mining_rack_desc',
  price: 30,
  listPrice: 60,
  currency: 'BLK',
  isPurchaseLive: true,
};

function body(over: Record<string, unknown> = {}) {
  return {
    data: {
      ok: true,
      events: [],
      roomOffers: null,
      fanOffers: { isLive: true, isPurchaseLive: true, title: 'Ofertas de Ventilador', items: [FAN] },
      rackOffers: { isLive: true, isPurchaseLive: true, title: 'Ofertas de Rack', items: [RACK] },
      ...over,
    },
  };
}

function renderPage() {
  return render(
    <I18nextProvider i18n={i18n}>
      <OffersPage />
    </I18nextProvider>,
  );
}

/** Abre o modal a partir do card cujo título casa com `nameKey` traduzido. */
async function openBuyModalFor(cardTitle: string) {
  const user = userEvent.setup();
  const heading = await screen.findByText(cardTitle);
  const card = heading.closest('div.bg-surface');
  expect(card).toBeTruthy();
  const buyButton = Array.from(card!.querySelectorAll('button')).at(-1)!;
  await user.click(buyButton);
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
  clearActiveOffersCache();
  getActive.mockResolvedValue(body());
  fanPurchase.mockResolvedValue({ data: { ok: true } });
  rackPurchase.mockResolvedValue({ data: { ok: true } });
  eventPurchase.mockResolvedValue({ data: { ok: true } });
});

afterEach(() => cleanup());

describe('OffersPage', () => {
  it('busca as ofertas ativas e renderiza as seções de fan e rack', async () => {
    renderPage();
    expect(await screen.findByText('Ofertas de Ventilador')).toBeInTheDocument();
    expect(screen.getByText('Ofertas de Rack')).toBeInTheDocument();
    expect(getActive).toHaveBeenCalledTimes(1);
  });

  it('esconde uma seção quando ela não está live', async () => {
    getActive.mockResolvedValue(
      body({ fanOffers: { isLive: false, items: [FAN] } }),
    );
    renderPage();
    expect(await screen.findByText('Ofertas de Rack')).toBeInTheDocument();
    expect(screen.queryByText('Ofertas de Ventilador')).not.toBeInTheDocument();
  });

  it('comprar um ventilador chama a API de FAN com o sku certo — nunca a de rack', async () => {
    renderPage();
    const user = await openBuyModalFor(i18n.t('fans.cooling_system_name'));

    await user.click(await screen.findByText(i18n.t('offers.confirm_payment')));

    await waitFor(() => expect(fanPurchase).toHaveBeenCalledTimes(1));
    expect(fanPurchase).toHaveBeenCalledWith({ sku: 'FAN_BASIC', quantity: 1 });
    expect(rackPurchase).not.toHaveBeenCalled();
    expect(eventPurchase).not.toHaveBeenCalled();
  });

  it('comprar um rack chama a API de RACK com o sku certo — nunca a de fan', async () => {
    renderPage();
    const user = await openBuyModalFor(i18n.t('racks.mining_rack_name'));

    await user.click(await screen.findByText(i18n.t('offers.confirm_payment')));

    await waitFor(() => expect(rackPurchase).toHaveBeenCalledTimes(1));
    expect(rackPurchase).toHaveBeenCalledWith({ sku: 'RACK_BASIC', quantity: 1 });
    expect(fanPurchase).not.toHaveBeenCalled();
  });

  it('a quantidade escolhida no modal chega na chamada', async () => {
    renderPage();
    const user = await openBuyModalFor(i18n.t('fans.cooling_system_name'));

    const plus = screen.getByText(i18n.t('offers.quantity')).closest('div')!.querySelectorAll('button');
    await user.click(plus[plus.length - 1]);
    await user.click(screen.getByText(i18n.t('offers.confirm_payment')));

    await waitFor(() => expect(fanPurchase).toHaveBeenCalledWith({ sku: 'FAN_BASIC', quantity: 2 }));
  });

  it('uma compra bem-sucedida fecha o modal e recarrega saldo e ofertas', async () => {
    renderPage();
    const user = await openBuyModalFor(i18n.t('fans.cooling_system_name'));
    await user.click(await screen.findByText(i18n.t('offers.confirm_payment')));

    await waitFor(() => expect(fetchAll).toHaveBeenCalled());
    expect(getActive).toHaveBeenCalledTimes(2); // load inicial + reload pós-compra
    await waitFor(() =>
      expect(screen.queryByText(i18n.t('offers.confirm_payment'))).not.toBeInTheDocument(),
    );
  });

  it('cancelar fecha o modal sem comprar nada', async () => {
    renderPage();
    const user = await openBuyModalFor(i18n.t('fans.cooling_system_name'));

    await user.click(await screen.findByText(i18n.t('common.cancel')));

    await waitFor(() =>
      expect(screen.queryByText(i18n.t('offers.confirm_payment'))).not.toBeInTheDocument(),
    );
    expect(fanPurchase).not.toHaveBeenCalled();
  });

  it('resposta não-ok preserva a tela em vez de apagar as ofertas', async () => {
    writeActiveOffersCache({
      events: [],
      roomOffers: null,
      fanOffers: { isLive: true, isPurchaseLive: true, title: 'Ofertas de Ventilador', items: [FAN] },
      rackOffers: { isLive: true, isPurchaseLive: true, title: 'Ofertas de Rack', items: [RACK] },
    });
    getActive.mockResolvedValue({ data: { ok: false } });
    renderPage();
    expect(screen.getByText('Ofertas de Ventilador')).toBeInTheDocument();
    expect(screen.getByText('Ofertas de Rack')).toBeInTheDocument();
    await waitFor(() => expect(getActive).toHaveBeenCalled());
    expect(screen.getByText('Ofertas de Ventilador')).toBeInTheDocument();
    expect(screen.getByText('Ofertas de Rack')).toBeInTheDocument();
  });
});
