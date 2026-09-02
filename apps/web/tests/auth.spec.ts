import { expect, test } from '@playwright/test';
import { waitForApp } from './helpers';

test('signed out: landing shows sign-in and protected routes redirect home', async ({ page }) => {
  await page.goto('/devices');
  await waitForApp(page);
  await expect(page).toHaveURL('/');
  await expect(page.getByTestId('sign-in')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0);
});

test('sign-in builds an /authorize URL with PKCE for the public client', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  // Capture the navigation the button triggers instead of following it to the (mock) index.
  await page.route('http://localhost:8787/authorize**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<title>index</title>' }),
  );
  await page.getByTestId('sign-in').click();
  await page.waitForURL(/localhost:8787\/authorize/);
  const q = new URL(page.url()).searchParams;
  expect(q.get('client_id')).toBe('idz_test_dashboard');
  expect(q.get('response_type')).toBe('code');
  expect(q.get('code_challenge_method')).toBe('S256');
  expect(q.get('redirect_uri')).toBe('http://localhost:4301/callback');
  expect(q.get('client_secret')).toBeNull();
});

test('callback exchanges the code and lands on the overview', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem(
      'idz:oidc-tx',
      JSON.stringify({
        state: 'st',
        nonce: 'mock-nonce',
        verifier: 'v',
        clientId: 'idz_test_dashboard',
      }),
    );
  });
  await page.goto('/callback?code=good-code&state=st');
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'Hi, @george' })).toBeVisible();
  await expect(page.getByTestId('tile-devices')).toHaveText('2');
});

test('callback with a bad state explains and offers a way back', async ({ page }) => {
  await page.goto('/callback?code=good-code&state=nope');
  await expect(page.getByRole('status')).toContainText('state mismatch');
  await page.getByRole('button', { name: 'Back to sign in' }).click();
  await expect(page).toHaveURL('/');
});
