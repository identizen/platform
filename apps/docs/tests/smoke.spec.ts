import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PAGES = [
  '/',
  '/quickstart/',
  '/add-mfa/',
  '/guides/nextjs/',
  '/guides/express/',
  '/guides/aspnet-core/',
  '/guides/django/',
  '/guides/plain-html/',
  '/guides/react/',
  '/ai-assistants/',
  '/reference/verification-api/',
  '/reference/oidc/',
  '/reference/oidc-conformance/',
  '/reference/sdk/',
  '/reference/index-api/',
  '/reference/openapi/',
  '/errors/',
  '/self-hosting/',
  '/self-hosting-production/',
  '/data-handling/',
  '/testing/',
  '/versioning/',
  '/enterprise/',
  '/enterprise/cloud-setup/',
  '/enterprise/portal/',
  '/enterprise/org-app/',
  '/enterprise/enrollment/',
  '/enterprise/policy/',
  '/enterprise/mdm/',
  '/enterprise/mfa-and-step-up/',
  '/protocol/',
  '/protocol/vectors/',
];

for (const path of PAGES) {
  test(`${path} renders with an h1 and no axe violations`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1').first()).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}

test('sidebar navigation reaches the quickstart', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Quickstart' }).first().click();
  await expect(page).toHaveURL(/\/quickstart\/?$/);
  await expect(page.locator('h1')).toContainText('Quickstart');
});

test('theme choice persists across reload and syncs to idz:theme', async ({ page }) => {
  await page.goto('/quickstart/');
  await page.evaluate(() => {
    localStorage.setItem('starlight-theme', 'dark');
  });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('idz:theme'))).toBe('dark');
});

test('errors page has an anchor per error code', async ({ page }) => {
  await page.goto('/errors/');
  for (const code of ['config_index_url', 'invalid_grant', 'replayed_request', 'login_required']) {
    await expect(page.locator(`#${code}`)).toHaveCount(1);
  }
});

test('llms.txt, llms-full.txt and per-page markdown are served', async ({ request }) => {
  const index = await request.get('/llms.txt');
  expect(index.status()).toBe(200);
  expect(index.headers()['content-type']).toContain('text/plain');
  const text = await index.text();
  expect(text.startsWith('# Identizen')).toBe(true);
  expect(text).toContain('> Identizen is accountless identity, open source');
  expect(text).toContain('## Add Identizen to a React + TypeScript app');
  expect(text).toContain('npx identizen register-site');
  expect(text).toContain('https://docs.identizen.com/quickstart.md');
  expect(text).not.toMatch(/<Steps>|<Aside|^import /m);

  const full = await request.get('/llms-full.txt');
  expect(full.status()).toBe(200);
  expect((await full.text()).split('\n---\n').length).toBeGreaterThan(15);

  const page = await request.get('/guides/react.md');
  expect(page.status()).toBe(200);
  expect(page.headers()['content-type']).toContain('text/markdown');
  expect(await page.text()).toContain('# React (any app)');
});

test('floating ask-an-AI buttons are on every page, desktop only', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/quickstart/');
  const aside = page.getByTestId('ask-ai');
  await expect(aside).toBeVisible();
  await expect(aside.getByRole('link')).toHaveCount(3);
  const href = await page.getByTestId('ask-ai-claude').getAttribute('href');
  expect(href?.startsWith('https://claude.ai/new?q=')).toBe(true);
  expect(decodeURIComponent(href ?? '')).toContain('https://docs.identizen.com/llms.txt');
  // Below 72rem Starlight has no right column, so the corner would cover text.
  await page.setViewportSize({ width: 1100, height: 800 });
  await expect(aside).toBeHidden();
});
