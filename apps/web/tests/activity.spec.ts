import { expect, test } from '@playwright/test';
import { signedIn } from './helpers';

test('activity: audit timeline newest first with readable labels', async ({ page }) => {
  await signedIn(page);
  await page.goto('/activity');
  const list = page.getByRole('list', { name: 'Activity' });
  await expect(list.getByRole('listitem')).toHaveCount(6);
  await expect(list.getByRole('listitem').first()).toContainText('Session started');
  await expect(list.getByText('Approval granted')).toBeVisible();
  await expect(list.getByText('Approve wire transfer of $12,000 to Acme?')).toBeVisible();
  await expect(list.getByText('Device revoked')).toBeVisible();
});
