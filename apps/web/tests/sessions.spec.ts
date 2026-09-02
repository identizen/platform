import { expect, test } from '@playwright/test';
import { signedIn } from './helpers';

test('sessions: list marks this dashboard and ends a session', async ({ page }) => {
  await signedIn(page);
  await page.goto('/sessions');
  const list = page.getByRole('list', { name: 'Sessions' });
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await expect(list.getByText('this dashboard')).toBeVisible();
  await expect(list.getByText('idz_live_acme')).toBeVisible();
  await page
    .getByRole('button', { name: /^End session/ })
    .nth(1)
    .click();
  await page.getByRole('button', { name: 'End session', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Session ended.');
  await expect(list.getByRole('listitem')).toHaveCount(1);
});
