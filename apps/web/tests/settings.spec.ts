import { expect, test } from '@playwright/test';
import { signedIn } from './helpers';

test('settings: change handle, remove it, toggle theme persistently, sign out', async ({
  page,
}) => {
  await signedIn(page);
  await page.goto('/settings');
  await expect(page.getByTestId('idz')).toHaveText(/^[A-Za-z0-9_-]{32}$/);

  const handle = page.getByLabel('Handle');
  await expect(handle).toHaveValue('george');
  await handle.fill('x');
  await page.getByRole('button', { name: 'Save handle' }).click();
  await expect(page.getByRole('alert')).toContainText('At least 3 characters');

  await handle.fill('taken');
  await page.getByRole('button', { name: 'Save handle' }).click();
  await expect(page.getByRole('alert')).toContainText('handle already taken');

  await handle.fill('George.R');
  await page.getByRole('button', { name: 'Save handle' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved as @george.r' })).toBeVisible();
  await expect(handle).toHaveValue('george.r');

  await page.getByRole('button', { name: 'Remove handle' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Handle removed.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove handle' })).toHaveCount(0);

  // Theme: light -> dark, persisted across reload.
  const toggle = page.getByRole('button', { name: /^Theme:/ }).first();
  for (let i = 0; i < 3; i++) {
    if ((await page.locator('html').getAttribute('data-theme')) === 'dark') break;
    await toggle.click();
  }
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.getByTestId('sign-out').click();
  await expect(page).toHaveURL('/');
  await expect(page.getByTestId('sign-in')).toBeVisible();
});
