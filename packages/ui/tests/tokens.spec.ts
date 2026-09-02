import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const THEMES = ['light', 'dark'] as const;

for (const theme of THEMES) {
  test.describe(`token sheet — ${theme}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((t) => {
        localStorage.setItem('idz:theme', t);
      }, theme);
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Identizen tokens' })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.evaluate(() => document.fonts.ready);
    });

    test('matches the visual snapshot', async ({ page }) => {
      await expect(page).toHaveScreenshot(`token-sheet-${theme}.png`, { fullPage: true });
    });

    test('has no axe violations', async ({ page }) => {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  });
}

test('theme toggle cycles and persists', async ({ page }) => {
  await page.goto('/');
  const toggle = page.getByRole('button', { name: /^Theme:/ });
  await expect(toggle).toHaveAttribute('data-theme-preference', 'system');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: /^Theme:/ })).toHaveAttribute(
    'data-theme-preference',
    'dark',
  );
});
