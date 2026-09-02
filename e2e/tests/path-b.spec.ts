import { expect, test } from '@playwright/test';
import { expectPushed, phone, scanFromPage } from './helpers';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await phone.reset();
  await phone.policy('approve');
});

test('Path B: password login, enroll a phone, step-up with acr idz:mfa, Verification API with a reason', async ({
  page,
}) => {
  // Site's own login.
  await page.goto('/login');
  await page.getByLabel('Username').fill('alice');
  await page.getByLabel('Password').fill('password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/account/);
  await expect(page.getByTestId('username')).toHaveText('alice');
  await expect(page.getByTestId('enrolled')).toHaveText('not enrolled');

  // Enroll: prompt=enroll runs discovery; the site stores the returned sub.
  await page.getByRole('link', { name: 'Enroll your phone' }).click();
  await expect(page).toHaveURL(/\/authorize/);
  await expect(page.locator('#qr')).toBeVisible();
  await scanFromPage(page);
  await expect(page).toHaveURL(/\/account/);
  const enrolledSub = (await page.getByTestId('enrolled').textContent())?.trim() ?? '';
  expect(enrolledSub).toMatch(/^[A-Za-z0-9_-]{32}$/);
  await expect(page.getByTestId('acr')).toHaveText('none');

  // Step-up: acr_values=idz:mfa + login_hint pushes straight to the bound phone.
  let logLen = (await phone.log()).length;
  await page.getByRole('link', { name: 'Step up' }).click();
  await Promise.race([expect(page).toHaveURL(/\/account/), expectPushed(page)]);
  await expect(page).toHaveURL(/\/account/);
  const challenge = await phone.waitForEvent('challenge', logLen);
  expect(challenge.detail?.via).toBe('push');
  expect(challenge.detail?.acr).toBe('idz:mfa');
  await expect(page.getByTestId('acr')).toHaveText('idz:mfa');
  await expect(page.getByTestId('amr')).toHaveText('face,hwk');

  // Verification API: the site asks the index to verify a transaction with a reason.
  logLen = (await phone.log()).length;
  await page.getByLabel('Reason').fill('Approve wire transfer of $12,000 to Acme?');
  await page.getByRole('button', { name: 'Approve on phone' }).click();
  const v = await phone.waitForEvent('challenge', logLen);
  expect(v.detail?.reason).toBe('Approve wire transfer of $12,000 to Acme?');
  expect(v.detail?.acr).toBe('idz:mfa');
  await expect(page.getByTestId('verify-status')).toHaveText('approved');
  await expect(page.getByTestId('verify-reason-ok')).toHaveText('reason hash matches');
  await expect(page.getByTestId('webhook-status')).toHaveText('approved');
});

test('Verification API denial is reported', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username').fill('alice');
  await page.getByLabel('Password').fill('password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/account/);
  await phone.policy('deny');
  await page.getByLabel('Reason').fill('Delete everything?');
  await page.getByRole('button', { name: 'Approve on phone' }).click();
  await expect(page.getByTestId('verify-status')).toHaveText('denied');
  await phone.policy('approve');
});
