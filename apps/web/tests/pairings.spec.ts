import { expect, test } from '@playwright/test';
import { signedIn } from './helpers';

test('paired browsers: list and unpair', async ({ page }) => {
  await signedIn(page);
  await page.goto('/pairings');
  const list = page.getByRole('list', { name: 'Paired browsers' });
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await expect(list.getByText('Safari on macOS')).toBeVisible();
  await page.getByRole('button', { name: 'Unpair Safari on macOS' }).click();
  await page.getByRole('button', { name: 'Unpair browser' }).click();
  await expect(page.getByRole('status')).toContainText('Browser unpaired.');
  await expect(list.getByText('revoked')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Unpair Safari on macOS' })).toHaveCount(0);
});
