import { expect, test } from '@playwright/test';
import { signedIn } from './helpers';

test('devices: list, badges, revoke with confirmation', async ({ page }) => {
  await signedIn(page);
  await page.goto('/devices');
  const list = page.getByRole('list', { name: 'Devices' });
  await expect(list.getByRole('listitem')).toHaveCount(3);
  await expect(list.getByText('Bluetooth')).toHaveCount(2);
  await expect(list.getByText('revoked')).toHaveCount(1);

  const revoke = page.getByRole('button', { name: /^Revoke device/ }).first();
  await revoke.click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(list.getByText('revoked')).toHaveCount(1);

  await page
    .getByRole('button', { name: /^Revoke device/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Revoke device', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Device revoked. 2 session(s) ended.');
  await expect(list.getByText('revoked')).toHaveCount(2);
});
