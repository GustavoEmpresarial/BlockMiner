import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import { AxiosError } from 'axios';
import appI18n from './config';
import en from './locales/en.json';
import es from './locales/es.json';

const post = vi.fn();
vi.mock('../shared/auth/auth.store', () => ({ api: { post: (...a: unknown[]) => post(...a) } }));
vi.mock('../shared/utils/clientErrorTelemetry', () => ({ reportClientCrash: vi.fn() }));

import { BmCaptchaModal } from '../features/bm-captcha/BmCaptchaModal';
import RootErrorBoundary from '../app/RootErrorBoundary';
import { TermsOfUsePage } from '../features/legal/TermsOfUsePage';
import { PrivacyPolicyPage } from '../features/legal/PrivacyPolicyPage';
import { readAuthErrorMessage } from '../shared/auth/auth.errors';
import { AiInfrastructure3DSection } from '../features/transparency/components/transparency.ai-models';
import ImageUploader from '../shared/components/ImageUploader';

/** Portuguese-only characters/words that must not leak into an English or Spanish screen. */
const PT_LEAK = /[ãõç]|\b(você|não|peças?|carteira|tente|entrar|carregando|verificação)\b/i;

async function renderIn(lng: 'en' | 'es', ui: React.ReactElement) {
  const i18n = i18next.createInstance();
  await i18n.init({ lng, resources: { [lng]: { translation: lng === 'en' ? en : es } }, interpolation: { escapeValue: false } });
  return render(
    <MemoryRouter>
      <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  post.mockReset();
});

describe('captcha modal', () => {
  it('is in English and turns a server code into a sentence, not a raw code', async () => {
    post.mockResolvedValueOnce({ status: 429, data: { code: 'RATE_LIMITED' } });
    const { container } = await renderIn('en', <BmCaptchaModal provider="zerads" onSuccess={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(en.bmCaptcha.title)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(en.bmCaptcha.errors.RATE_LIMITED)).toBeInTheDocument());
    expect(container.textContent).not.toContain('RATE_LIMITED');
    expect(container.textContent?.match(PT_LEAK)?.[0] ?? null).toBeNull();
  });

  it('falls back to the generic message for an unknown code', async () => {
    post.mockResolvedValueOnce({ status: 500, data: { code: 'INTERNAL' } });
    await renderIn('es', <BmCaptchaModal provider="zerads" onSuccess={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(es.bmCaptcha.errors.generic)).toBeInTheDocument());
  });
});

describe('screens that read the global i18n instance', () => {
  beforeAll(async () => {
    await appI18n.changeLanguage('en');
  });

  it('crash screen is in English', () => {
    const Boom = () => {
      throw new Error('boom');
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(
      <RootErrorBoundary>
        <Boom />
      </RootErrorBoundary>,
    );
    expect(screen.getByText(en.rootError.title)).toBeInTheDocument();
    expect(screen.getByText(en.rootError.reload)).toBeInTheDocument();
    const visible = (container.textContent ?? '').replace(/boom[\s\S]*$/m, '');
    expect(visible.match(PT_LEAK)?.[0] ?? null).toBeNull();
  });

  it('sign-in errors are in English', () => {
    const network = new AxiosError('Network Error');
    expect(readAuthErrorMessage(network)).toBe(en.auth.client_errors.network);
    const busy = new AxiosError('bad gateway', undefined, undefined, undefined, {
      status: 502,
      data: {},
    } as never);
    expect(readAuthErrorMessage(busy)).toBe(en.auth.client_errors.gateway_busy);
    expect(readAuthErrorMessage({})).toBe(en.auth.client_errors.login_failed);
  });
});

describe('legal documents in Spanish', () => {
  it.each([
    ['Terms of Use', <TermsOfUsePage key="t" />, es.legal.termsOfUse.sections.generalProvisions.paragraphs[0]],
    ['Privacy Policy', <PrivacyPolicyPage key="p" />, es.legal.privacyPolicy.sections.controllerContact.paragraphs[0]],
  ])('%s body is Spanish and says the English version prevails', async (_name, page, firstParagraph) => {
    const { container } = await renderIn('es', page);
    expect(container.textContent).toContain(firstParagraph);
    expect(container.textContent).not.toContain('By using blockminer.space');
    expect(screen.getByTestId('legal-translation-notice')).toHaveTextContent(es.legal.common.translationNotice);
  });

  it('English legal pages show no translation notice', async () => {
    await renderIn('en', <TermsOfUsePage />);
    expect(screen.queryByTestId('legal-translation-notice')).toBeNull();
  });
});

describe('transparency and admin upload', () => {
  it.each(['en', 'es'] as const)('AI & infrastructure 3D block has no Portuguese in %s', async (lng) => {
    const L = lng === 'en' ? en : es;
    const { container } = await renderIn(lng, <AiInfrastructure3DSection />);
    expect(screen.getByText(L.transparency.ai_models.title)).toBeInTheDocument();
    expect(container.textContent).toContain(L.transparency.ai_models.items.claude.description);
    expect(container.textContent?.match(PT_LEAK)?.[0] ?? null).toBeNull();
    expect(container.textContent).not.toMatch(/Assinatura|balanço|Arraste|Mascote|\/mês/);
  });

  it('image uploader is in Spanish', async () => {
    const { container } = await renderIn('es', <ImageUploader value="" onChange={vi.fn()} />);
    expect(screen.getByText(es.imageUploader.drop_hint)).toBeInTheDocument();
    expect(screen.getByText(es.imageUploader.label)).toBeInTheDocument();
    expect(container.textContent?.match(PT_LEAK)?.[0] ?? null).toBeNull();
  });
});
