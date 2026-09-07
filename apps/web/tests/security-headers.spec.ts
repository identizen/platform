import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { signedIn, waitForApp } from './helpers';

const dist = new URL('../dist/index.html', import.meta.url);
const headersFile = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');

/** The CSP the deployed Worker sends, from `public/_headers`. */
function deployedCsp(): string {
  const line = headersFile
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith('Content-Security-Policy:'));
  if (!line) throw new Error('no Content-Security-Policy in public/_headers');
  return line.trim().slice('Content-Security-Policy:'.length).trim();
}

test('the built page carries no inline script', () => {
  const html = readFileSync(dist, 'utf8');
  const inline = [...html.matchAll(/<script\b([^>]*)>/g)].filter((m) => !/\bsrc=/.test(m[1] ?? ''));
  expect(inline).toEqual([]);
});

test('the dashboard works under the deployed CSP', async ({ page }) => {
  // Vite preview does not read `_headers`; apply the real policy to every HTML response. The
  // mock index lives on localhost, which production never talks to, so allow it for the test.
  const csp = deployedCsp().replace(
    "connect-src 'self'",
    "connect-src 'self' http://localhost:8787",
  );
  await page.route('**/*', async (route) => {
    const response = await route.fetch();
    const headers = { ...response.headers() };
    if ((headers['content-type'] ?? '').includes('text/html')) {
      headers['content-security-policy'] = csp;
    }
    await route.fulfill({ response, headers });
  });
  const violations: string[] = [];
  page.on('console', (msg) => {
    if (/Content Security Policy/i.test(msg.text())) violations.push(msg.text());
  });
  await signedIn(page, 'dark');
  await page.goto('/devices');
  await waitForApp(page);
  await expect(page.getByRole('heading', { name: /devices/i })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(violations).toEqual([]);
});
