import { afterEach, describe, expect, it, vi } from 'vitest';
import { indexUrlFromHost, resolveIndexUrl } from './config';

describe('indexUrlFromHost', () => {
  it('maps a tenant app host to the tenant index', () => {
    expect(indexUrlFromHost('acme.app.identizen.com')).toBe('https://acme.index.identizen.com');
    expect(indexUrlFromHost('Acme-1.app.example.co.uk')).toBe('https://Acme-1.index.example.co.uk');
  });

  it('returns null for hosts without a tenant label', () => {
    expect(indexUrlFromHost('app.identizen.com')).toBeNull();
    expect(indexUrlFromHost('localhost')).toBeNull();
    expect(indexUrlFromHost('index.identizen.com')).toBeNull();
    expect(indexUrlFromHost('acme.app')).toBeNull();
  });
});

describe('resolveIndexUrl', () => {
  it('prefers runtime config, then env, then the host rule, then the local index', () => {
    const all = {
      runtime: 'https://runtime.example/',
      env: 'https://env.example',
      hostname: 'acme.app.identizen.com',
    };
    expect(resolveIndexUrl(all)).toBe('https://runtime.example');
    expect(resolveIndexUrl({ ...all, runtime: undefined })).toBe('https://env.example');
    expect(resolveIndexUrl({ hostname: all.hostname })).toBe('https://acme.index.identizen.com');
    expect(resolveIndexUrl({ hostname: 'app.identizen.com' })).toBe('http://localhost:8787');
    expect(resolveIndexUrl({})).toBe('http://localhost:8787');
  });
});

describe('INDEX_URL and client id at module load', () => {
  afterEach(() => {
    delete window.__IDZ_CONFIG__;
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('reads window.__IDZ_CONFIG__ ahead of the Vite env', async () => {
    window.__IDZ_CONFIG__ = { indexUrl: 'https://tenant.index.example/', clientId: 'idz_rt' };
    vi.stubEnv('VITE_IDENTIZEN_INDEX_URL', 'https://env.example');
    vi.stubEnv('VITE_IDENTIZEN_CLIENT_ID', 'idz_env');
    vi.resetModules();
    const mod = await import('./config');
    expect(mod.INDEX_URL).toBe('https://tenant.index.example');
    await expect(mod.resolveClientId()).resolves.toBe('idz_rt');
  });

  it('falls back to the Vite env when no runtime config is set', async () => {
    vi.stubEnv('VITE_IDENTIZEN_INDEX_URL', 'https://env.example/');
    vi.stubEnv('VITE_IDENTIZEN_CLIENT_ID', 'idz_env');
    vi.resetModules();
    const mod = await import('./config');
    expect(mod.INDEX_URL).toBe('https://env.example');
    await expect(mod.resolveClientId()).resolves.toBe('idz_env');
  });
});
