import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fillVerifyForm,
  loadFromenance,
  resetFromenanceLoader,
  watchTheme,
  widgetTheme,
} from './widget';

const api = { mount: vi.fn(), version: 'test' };

afterEach(() => {
  resetFromenanceLoader();
  delete window.Fromenance;
  document.head.querySelectorAll('script').forEach((s) => s.remove());
  document.documentElement.removeAttribute('data-theme');
});

describe('loadFromenance', () => {
  it('injects verify.js once and resolves with the global when it loads', async () => {
    const a = loadFromenance();
    const b = loadFromenance();
    const scripts = document.head.querySelectorAll('script[src*="verify.js"]');
    expect(scripts).toHaveLength(1);
    window.Fromenance = api;
    scripts[0]?.dispatchEvent(new Event('load'));
    await expect(a).resolves.toBe(api);
    await expect(b).resolves.toBe(api);
  });

  it('returns the global directly once it exists', async () => {
    window.Fromenance = api;
    await expect(loadFromenance()).resolves.toBe(api);
    expect(document.head.querySelectorAll('script')).toHaveLength(0);
  });

  it('rejects when the script fails and lets the next call try again', async () => {
    const first = loadFromenance();
    document.head.querySelector('script')?.dispatchEvent(new Event('error'));
    await expect(first).rejects.toThrow(/verify\.js/);
    expect(document.head.querySelectorAll('script')).toHaveLength(0);
    void loadFromenance().catch(() => undefined);
    expect(document.head.querySelectorAll('script')).toHaveLength(1);
  });
});

describe('fillVerifyForm', () => {
  it('sets the widget fields by their accessible labels', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <textarea aria-label="Message text"></textarea>
      <input aria-label="Reference code" />
      <input aria-label="Your email address" />`;
    expect(fillVerifyForm(root, { text: 'hello', email: 'a@b.c' })).toBe(true);
    expect(root.querySelector('textarea')?.value).toBe('hello');
    expect(root.querySelector<HTMLInputElement>('input[aria-label="Reference code"]')?.value).toBe(
      '',
    );
    expect(
      root.querySelector<HTMLInputElement>('input[aria-label="Your email address"]')?.value,
    ).toBe('a@b.c');
  });

  it('reports false before the widget has mounted', () => {
    expect(fillVerifyForm(document.createElement('div'), { text: 'x' })).toBe(false);
  });
});

describe('theme', () => {
  it('prefers the explicit data-theme on <html>', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    expect(widgetTheme()).toBe('dark');
  });

  it('notifies when the site toggle changes the theme', async () => {
    const seen: string[] = [];
    const stop = watchTheme((t) => seen.push(t));
    document.documentElement.setAttribute('data-theme', 'dark');
    await new Promise((r) => setTimeout(r, 0));
    stop();
    expect(seen).toEqual(['dark']);
  });
});
