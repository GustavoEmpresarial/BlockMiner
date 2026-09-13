import { test, expect, type Page, type BrowserContext } from '@playwright/test';

/**
 * Real end-to-end coverage for /power-stats — the screen this whole quality pass
 * targeted, run against the actual deployed staging app (real browser, real
 * backend, real DB), not a mocked/unit-level render. This is exactly the kind of
 * "página inteira quebra" regression the lazyWithRetry root-cause fix earlier in
 * this pass addressed — a stale/failed lazy chunk should degrade to a retry, not
 * crash the whole app, and only a real browser hitting real network chunks can
 * prove that.
 *
 * Creates exactly ONE disposable, uniquely-tagged account for the whole suite in
 * `beforeAll`, then reuses that same authenticated page across all 3 tests
 * (rather than Playwright's usual one-fresh-page-per-test isolation). The
 * registration endpoint has a real anti-abuse control
 * (server/modules/auth/register/register.risk.ts) that blocks repeated
 * registrations from the same IP within a 15-minute window — registering once
 * and reusing the session is both faster and avoids tripping that control on
 * every run, exactly as a real user session would.
 *
 * Turnstile is disabled on staging (FEATURE_TURNSTILE_ENABLED=0), so this doesn't
 * need a captcha bypass. Never targets production.
 */

function disposableAccount() {
  const tag = `e2eps${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  return {
    // Registration enforces a real-provider allowlist (gmail/outlook/etc — see
    // server/modules/auth/register/registerAllowedEmailDomains.ts); a fabricated
    // domain like *.test is rejected with email_provider_not_allowed. Login never
    // requires email verification, so a syntactically-valid but undeliverable
    // gmail.com address works fine for a disposable E2E account.
    username: tag.slice(0, 24),
    email: `${tag}@gmail.com`,
    password: 'E2eTest!Pass123',
  };
}

/**
 * The authenticated shell can show a full-screen admin broadcast popup
 * (BroadcastPopup.tsx, `role="dialog" aria-modal="true"`) that intercepts all
 * pointer events until dismissed. Its "Entendi" button is disabled for up to
 * `dismissDelaySeconds` (capped at 120s) after mount, so this is a real,
 * intentional UX gate — not a bug — and any test driving the real UI must wait
 * it out rather than assume no broadcast is active on the shared dev environment.
 */
async function dismissBroadcastIfPresent(page: Page) {
  const dialog = page.getByRole('dialog', { name: /.*/ }).filter({ has: page.getByRole('button', { name: /entendi/i }) });
  if (await dialog.isVisible({ timeout: 2_000 }).catch(() => false)) {
    const button = dialog.getByRole('button', { name: /entendi/i });
    await expect(button).toBeEnabled({ timeout: 130_000 });
    await button.click();
    await expect(dialog).toBeHidden({ timeout: 5_000 });
  }
}

test.describe('power-stats — real browser E2E against staging', () => {
  test.describe.configure({ mode: 'serial' });

  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();

    const account = disposableAccount();
    await page.goto('/register');
    await page.locator('#username').fill(account.username);
    await page.locator('#email').fill(account.email);
    await page.locator('#password').fill(account.password);
    await page.locator('#confirmPassword').fill(account.password);
    await page.locator('#acceptTerms').check();
    await page.getByTestId('register-main-form').locator('button[type="submit"]').click();
    await page.waitForURL('**/dashboard', { timeout: 20_000 });
    await dismissBroadcastIfPresent(page);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('registers, navigates to /power-stats, and every tab renders without crashing the app', async () => {
    const consoleErrors: string[] = [];
    page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

    await page.goto('/power-stats');
    await dismissBroadcastIfPresent(page);
    await expect(page.getByRole('tablist')).toBeVisible({ timeout: 20_000 });

    const tabs = page.getByRole('tab');
    const tabCount = await tabs.count();
    expect(tabCount).toBeGreaterThanOrEqual(8); // summary/earnings/power/machines/boosts/network/history/tools

    for (let i = 0; i < tabCount; i += 1) {
      const tab = tabs.nth(i);
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      // The page shell (header + tablist) must survive every tab switch — this is
      // exactly what broke when the local lazyWithRetry duplicate's retry failed
      // and had nowhere to go but RootErrorBoundary, blanking the whole app.
      await expect(page.getByRole('tablist')).toBeVisible();
    }

    expect(consoleErrors, `uncaught page errors while cycling tabs: ${consoleErrors.join('; ')}`).toEqual([]);
  });

  test('the refresh button re-fetches without breaking the page', async () => {
    await page.goto('/power-stats');
    await dismissBroadcastIfPresent(page);
    await expect(page.getByRole('tablist')).toBeVisible({ timeout: 20_000 });

    const refreshButton = page.getByRole('button', { name: /atualizar|refresh/i });
    await refreshButton.click();
    await expect(page.getByRole('tablist')).toBeVisible();
  });

  test('a fresh account with zero activity shows the boosts tab without throwing (empty-state path)', async () => {
    await page.goto('/power-stats');
    await dismissBroadcastIfPresent(page);
    await expect(page.getByRole('tablist')).toBeVisible({ timeout: 20_000 });

    const boostsTab = page.getByRole('tab').nth(4); // summary,earnings,power,machines,boosts
    await boostsTab.click();
    await expect(boostsTab).toHaveAttribute('aria-selected', 'true');
    // A brand-new account has no active boosts — this must render the empty
    // state, not throw (this exact empty-state path was covered at the unit
    // level; this is the real-browser proof it holds end to end).
    await expect(page.getByText(/sem bónus temporários/i)).toBeVisible({ timeout: 10_000 });
  });
});
