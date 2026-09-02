import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PAGES = [
  '/',
  '/quickstart/',
  '/add-mfa/',
  '/guides/nextjs/',
  '/guides/express/',
  '/guides/aspnet-core/',
  '/guides/django/',
  '/guides/plain-html/',
  '/reference/verification-api/',
  '/reference/oidc/',
  '/reference/sdk/',
  '/reference/index-api/',
  '/errors/',
  '/self-hosting/',
  '/enterprise/',
  '/protocol/',
  '/protocol/vectors/',
];

for (const path of PAGES) {
  test(`${path} renders with an h1 and no axe violations`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1').first()).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}

test('sidebar navigation reaches the quickstart', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Quickstart' }).first().click();
  await expect(page).toHaveURL(/\/quickstart\/?$/);
  await expect(page.locator('h1')).toContainText('Quickstart');
});

test('theme choice persists across reload and syncs to idz:theme', async ({ page }) => {
  await page.goto('/quickstart/');
  await page.evaluate(() => {
    localStorage.setItem('starlight-theme', 'dark');
  });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('idz:theme'))).toBe('dark');
});

test('errors page has an anchor per error code', async ({ page }) => {
  await page.goto('/errors/');
  for (const code of ['config_index_url', 'invalid_grant', 'replayed_request', 'login_required']) {
    await expect(page.locator(`#${code}`)).toHaveCount(1);
  }
});
