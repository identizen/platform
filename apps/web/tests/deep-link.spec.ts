import { expect, test } from '@playwright/test';

test('deep link landing shows the site, the match code, and the app link; polls state', async ({
  page,
}) => {
  await page.goto('/l/ch_01K3ZB2N9G0000000000000020');
  await expect(page.getByRole('heading', { name: 'Sign in with your phone' })).toBeVisible();
  await expect(page.getByText('Acme Demo is asking you to approve.')).toBeVisible();
  await expect(page.getByTestId('code')).toHaveText('47');
  await expect(page.getByTestId('status')).toContainText('Waiting for approval');
  await expect(page.getByTestId('open-app')).toHaveAttribute(
    'href',
    'identizen://l/ch_01K3ZB2N9G0000000000000020',
  );
  await expect(page.getByRole('link', { name: 'Install Identizen' })).toBeVisible();
});

test('deep link for a step-up shows the reason', async ({ page }) => {
  await page.goto('/l/ch_01K3ZB2N9G0000000000000021');
  await expect(page.getByRole('heading', { name: 'Approve on your phone' })).toBeVisible();
  await expect(page.getByTestId('reason')).toHaveText('Approve wire transfer of $12,000 to Acme?');
  await expect(page.getByTestId('code')).toHaveText('08');
});

test('unknown deep link is explained', async ({ page }) => {
  await page.goto('/l/ch_01K3ZB2N9G0000000000000099');
  await expect(page.getByText('This link is not valid any more.')).toBeVisible();
});
