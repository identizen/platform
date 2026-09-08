import { expect, test } from '@playwright/test';
import { expectNoAxeViolations, signedIn } from './helpers';

test.describe('sidebar (lg and up)', () => {
  test('main navigation marks the current page and needs no menu button', async ({ page }) => {
    await signedIn(page);
    await page.goto('/sessions');
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Sessions' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(nav.getByRole('link', { name: 'Devices' })).not.toHaveAttribute('aria-current');
    await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeHidden();
    await expect(page.getByTestId('handle-chip')).toHaveText('@george');

    await nav.getByRole('link', { name: 'Paired browsers' }).click();
    await expect(page).toHaveURL('/pairings');
    await expect(nav.getByRole('link', { name: 'Paired browsers' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('sign out from the sidebar ends the session', async ({ page }) => {
    await signedIn(page);
    await page.goto('/devices');
    await page.getByTestId('shell-sign-out').click();
    await expect(page).toHaveURL('/');
    await expect(page.getByTestId('sign-in')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  });
});

test.describe('drawer (below lg)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('Menu opens a focused dialog; Escape and navigation close it', async ({ page }) => {
    await signedIn(page);
    await page.goto('/devices');
    const menu = page.getByRole('button', { name: 'Menu', exact: true });
    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await menu.click();
    const dialog = page.getByRole('dialog', { name: 'Menu' });
    await expect(dialog).toBeVisible();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    expect(
      await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null),
    ).toBe(true);
    await expectNoAxeViolations(page);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(menu).toBeFocused();

    await menu.click();
    await dialog.getByRole('link', { name: 'Sessions' }).click();
    await expect(page).toHaveURL('/sessions');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
  });
});
