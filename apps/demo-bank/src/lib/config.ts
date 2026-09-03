/** Runtime configuration: the index this demo talks to and its public PKCE client id. */

export const INDEX_URL: string = (
  import.meta.env.VITE_IDENTIZEN_INDEX_URL ?? 'http://localhost:8787'
).replace(/\/+$/, '');

export const CLIENT_ID: string = import.meta.env.VITE_IDENTIZEN_CLIENT_ID ?? 'idz_test_jtmerlin';

export const IDENTIZEN_SITE = 'https://identizen.com';
export const IDENTIZEN_DOCS = 'https://docs.identizen.com';
export const IDENTIZEN_SOURCE = 'https://github.com/identizen/platform';
export const DEMO_SOURCE = 'https://github.com/identizen/platform/tree/main/apps/demo-bank';

export function appOrigin(): string {
  return typeof location === 'undefined' ? 'http://localhost:4500' : location.origin;
}

export function redirectUri(): string {
  return `${appOrigin()}/callback`;
}
