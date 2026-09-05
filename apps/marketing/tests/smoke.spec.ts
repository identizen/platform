import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const PAGES = [
  ['/', 'Login with your phone.'],
  ['/developers', 'Built for the afternoon you have.'],
  ['/pricing', 'Free to run. Paid to not have to.'],
  ['/blog', 'Blog'],
  ['/blog/why-the-phone-is-the-identity', 'Why the phone is the identity'],
  ['/about', 'Identity that belongs to the person holding it.'],
  ['/contact', 'Talk to us.'],
  ['/playground', 'Try it before you write code.'],
  ['/brand', 'The mark is 君. It means you.'],
  ['/legal/privacy', 'Privacy Policy'],
  ['/legal/terms', 'Terms of Service'],
] as const;

for (const [path, h1] of PAGES) {
  test(`${path} renders, has the h1, and passes axe`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(h1);
    await expect(page).toHaveTitle(/Identizen/);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
}

test('navigation reaches every section and 404 is served', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Pricing' })
    .click();
  await expect(page).toHaveURL(/\/pricing$/);
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Developers' })
    .click();
  await expect(page).toHaveURL(/\/developers$/);
  await page.getByRole('link', { name: 'Identizen home' }).click();
  await expect(page).toHaveURL(/\/$/);
  const missing = await page.goto('/nope');
  expect(missing?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/not in the index/);
});

test('theme toggle persists across reload and navigation', async ({ page }) => {
  await page.goto('/');
  const toggle = page.getByRole('button', { name: /^Theme:/ });
  await expect(toggle).toHaveAttribute('data-theme-preference', 'system');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.goto('/pricing');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: /^Theme:/ })).toHaveAttribute(
    'data-theme-preference',
    'dark',
  );
});

test('contact form validates inline before sending', async ({ page }) => {
  await page.goto('/contact');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.locator('[data-error-for="name"]')).toHaveText('Tell us your name.');
  await expect(page.locator('[data-error-for="email"]')).toHaveText(/email/);
  await expect(page.locator('[data-error-for="message"]')).toHaveText(/more words/);
  await expect(page.getByRole('status')).toHaveText('Please fix the highlighted fields.');
  await page.getByLabel('Name').fill('Ada');
  await page.getByLabel('Email').fill('ada@example.com');
  await page.getByLabel('Message').fill('Hello there, Identizen team!');
  await page.route('**/api/contact', (route) =>
    route.fulfill({ status: 200, json: { ok: true, sent: false } }),
  );
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('status')).toHaveText(/Thanks/);
});

test('playground page explains configuration or renders the island', async ({ page }) => {
  await page.goto('/playground');
  const unconfigured = page.getByTestId('playground-unconfigured');
  const island = page.getByRole('radio', { name: 'Continue with Identizen' });
  await expect(unconfigured.or(island)).toBeVisible();
});

test('brand assets download as SVG from the design system', async ({ page, request }) => {
  await page.goto('/brand');
  const links = page.getByTestId('brand-downloads').getByRole('link');
  expect(await links.count()).toBeGreaterThanOrEqual(8);
  const href = await links.first().getAttribute('href');
  expect(href).toBe('/brand/identizen-lockup.svg');
  const res = await request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('image/svg+xml');
  expect(await res.text()).toContain('<svg');
  const mark = await request.get('/brand/alt/kimi-mark-brush.svg');
  expect(mark.status()).toBe(200);
});

test('search, social and answer-engine discovery', async ({ page, request }) => {
  await page.goto('/');
  const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
  const graph = JSON.parse(ld ?? '{}') as { '@graph': { '@type': string }[] };
  const types = graph['@graph'].map((n) => n['@type']);
  expect(types).toEqual(
    expect.arrayContaining(['Organization', 'WebSite', 'WebPage', 'SoftwareApplication']),
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/og\.png$/);
  await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute('content', /\/og\.png$/);
  await expect(page.locator('link[rel="alternate"][type="application/rss+xml"]')).toHaveCount(1);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://identizen.com/',
  );
  await expect(
    page.getByRole('contentinfo').getByRole('link', { name: 'llms.txt' }),
  ).toHaveAttribute('href', '/llms.txt');

  await page.goto('/faq');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Questions, answered plainly.');
  const faqLd = await page.locator('script[type="application/ld+json"]').first().textContent();
  const faqGraph = JSON.parse(faqLd ?? '{}') as {
    '@graph': { '@type': string; mainEntity?: unknown[] }[];
  };
  const faq = faqGraph['@graph'].find((n) => n['@type'] === 'FAQPage');
  expect(faq?.mainEntity?.length).toBeGreaterThan(8);

  await page.goto('/blog/why-the-phone-is-the-identity');
  const postLd = await page.locator('script[type="application/ld+json"]').first().textContent();
  expect(postLd).toContain('"BlogPosting"');
  await expect(page.locator('meta[property="article:published_time"]')).toHaveCount(1);

  for (const [path, type, needle] of [
    ['/rss.xml', 'xml', '<item>'],
    ['/llms.txt', 'text/plain', '# Identizen'],
    ['/robots.txt', 'text/plain', 'GPTBot'],
    ['/sitemap-index.xml', 'xml', 'sitemap-0.xml'],
    ['/site.webmanifest', 'manifest', '"Identizen"'],
    ['/.well-known/security.txt', 'text/plain', 'Expires:'],
    ['/og.png', 'image/png', ''],
  ] as const) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    expect(res.headers()['content-type'], path).toContain(type);
    if (needle) expect(await res.text(), path).toContain(needle);
  }
});
