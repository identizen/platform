import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export const MOCK_SESSION = {
  accessToken: 'mock-access-token',
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
  claims: {
    sub: 'S'.repeat(32),
    sid: 'sid_dashboard_0000000000000001',
    acr: 'idz:login',
    amr: ['face', 'hwk'],
    idz_handle: 'george',
  },
};

/** Seed a signed-in dashboard session and pick a theme before any page script runs. */
export async function signedIn(page: Page, theme: 'light' | 'dark' = 'light'): Promise<void> {
  await page.addInitScript(
    ({ session, t }) => {
      sessionStorage.setItem('idz:session', JSON.stringify(session));
      if (!localStorage.getItem('idz:theme')) localStorage.setItem('idz:theme', t);
    },
    { session: MOCK_SESSION, t: theme },
  );
}

export async function setTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.addInitScript((t) => {
    if (!localStorage.getItem('idz:theme')) localStorage.setItem('idz:theme', t);
  }, theme);
}

/** The mock service worker must be active before the app talks to the "index". */
export async function waitForApp(page: Page): Promise<void> {
  await expect(page.locator('#root')).not.toBeEmpty();
}

export async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}
