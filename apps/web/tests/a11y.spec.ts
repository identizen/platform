import { expect, test } from '@playwright/test';
import { expectNoAxeViolations, setTheme, signedIn } from './helpers';

const ROUTES: { path: string; ready: string; auth: boolean }[] = [
  { path: '/', ready: '[data-testid="sign-in"]', auth: false },
  { path: '/', ready: '[data-testid="tile-devices"]', auth: true },
  { path: '/devices', ready: '[aria-label="Devices"]', auth: true },
  { path: '/pairings', ready: '[aria-label="Paired browsers"]', auth: true },
  { path: '/sessions', ready: '[aria-label="Sessions"]', auth: true },
  { path: '/activity', ready: '[aria-label="Activity"]', auth: true },
  { path: '/settings', ready: '[data-testid="idz"]', auth: true },
  { path: '/l/ch_01K3ZB2N9G0000000000000020', ready: '[data-testid="code"]', auth: false },
];

for (const theme of ['light', 'dark'] as const) {
  for (const r of ROUTES) {
    const name = `${r.path === '/' ? (r.auth ? 'overview' : 'landing') : r.path.replace(/^\//, '').replace(/\/.*$/, '')}-${theme}`;
    test(`${name}: axe clean and matches snapshot`, async ({ page }) => {
      if (r.auth) await signedIn(page, theme);
      else await setTheme(page, theme);
      await page.goto(r.path);
      await expect(page.locator(r.ready).first()).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.evaluate(() => document.fonts.ready);
      await expectNoAxeViolations(page);
      await expect(page).toHaveScreenshot(`${name}.png`, {
        fullPage: true,
        mask: [page.locator('time')],
      });
    });
  }
}
