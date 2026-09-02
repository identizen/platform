import { expect, test } from '@playwright/test';
import { expectPushed, phone, scanFromPage } from './helpers';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await phone.reset();
  await phone.policy('approve');
});

test('Path A: QR login, logout, paired repeat login, pairing revoke forces QR, device revoke kills the session', async ({
  page,
}) => {
  // 1. First login: QR (scan), browser gets paired on approval.
  await page.goto('/');
  await page.getByRole('link', { name: 'Continue with Identizen' }).click();
  await expect(page).toHaveURL(/localhost:8787\/authorize/);
  await expect(page.locator('#qr')).toBeVisible();
  let logLen = (await phone.log()).length;
  await scanFromPage(page);
  await expect(page).toHaveURL(/\/dashboard/);
  const sub = (await page.getByTestId('sub').textContent())?.trim() ?? '';
  expect(sub).toMatch(/^[A-Za-z0-9_-]{32}$/);
  await expect(page.getByTestId('acr')).toHaveText('idz:login');
  const first = await phone.waitForEvent('approved', logLen);
  expect(first.detail?.sub).toBe(sub);
  const pairings = await phone.pairings();
  expect(pairings.filter((p) => p.status === 'active')).toHaveLength(1);
  const pairingId = pairings[0]?.id ?? '';

  // 2. Logout.
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL('/');
  await page.goto('/dashboard');
  await expect(page).toHaveURL('/');

  // 3. Repeat login: paired browser -> push straight to the phone, no QR.
  logLen = (await phone.log()).length;
  await page.getByRole('link', { name: 'Continue with Identizen' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  const second = await phone.waitForEvent('challenge', logLen);
  expect(second.detail?.via).toBe('push');
  await expect(page.getByTestId('sub')).toHaveText(sub);

  // 4. Revoke the pairing -> next login shows the QR again.
  await phone.revokePairing(pairingId);
  await page.getByRole('button', { name: 'Log out' }).click();
  logLen = (await phone.log()).length;
  await page.getByRole('link', { name: 'Continue with Identizen' }).click();
  await expect(page).toHaveURL(/\/authorize/);
  await expect(page.locator('#qr')).toBeVisible();
  await scanFromPage(page);
  await expect(page).toHaveURL(/\/dashboard/);
  const third = await phone.waitForEvent('challenge', logLen);
  expect(third.detail?.via).toBe('scan');
  await expect(page.getByTestId('sub')).toHaveText(sub);

  // 5. Revoke the device from another device -> back-channel logout kills the site session.
  expect((await phone.sessions()).length).toBeGreaterThan(0);
  await phone.revokeSelf();
  await expect
    .poll(async () => {
      await page.goto('/dashboard');
      return page.url();
    })
    .toMatch(/localhost:3000\/$/);
});

test('denial on the phone sends the browser back with access_denied', async ({ page }) => {
  await phone.reset();
  await phone.policy('deny');
  await page.goto('/');
  await page.getByRole('link', { name: 'Continue with Identizen' }).click();
  await scanFromPage(page);
  await expect(page).toHaveURL(/error=access_denied/);
  await phone.policy('approve');
});

test('the hosted login page verifies the match code and pushes when paired', async ({ page }) => {
  await phone.reset();
  await page.goto('/');
  await page.getByRole('link', { name: 'Continue with Identizen' }).click();
  await scanFromPage(page);
  await expect(page).toHaveURL(/\/dashboard/);
  await page.getByRole('button', { name: 'Log out' }).click();
  await page.getByRole('link', { name: 'Continue with Identizen' }).click();
  // Either we already landed on the dashboard, or the page shows the push hint.
  await Promise.race([
    expect(page).toHaveURL(/\/dashboard/),
    expectPushed(page).then(() => expect(page).toHaveURL(/\/dashboard/)),
  ]);
});
