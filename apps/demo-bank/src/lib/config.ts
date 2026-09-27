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

/**
 * Fromenance: the communication provenance platform behind /verify. Every value here is public.
 * The site key is bound to this site's origins on the Fromenance tenant, so it is useless elsewhere.
 */
export const FROMENANCE_SITE = 'https://fromenance.com';
export const FROMENANCE_DOCS = 'https://docs.fromenance.com';
export const FROMENANCE_WIDGET_URL = 'https://cdn.fromenance.com/verify.js';
export const FROMENANCE_SITE_KEY: string =
  import.meta.env.VITE_FROMENANCE_SITE_KEY ?? 'sk_pub_ba5ca4a4b3a5cea18dc7c1b01ba937d0';
/** Cloudflare Turnstile site key. The widget only asks for it once the site key is over its normal rate. */
export const FROMENANCE_TURNSTILE_SITE_KEY: string =
  import.meta.env.VITE_FROMENANCE_TURNSTILE_SITE_KEY ?? '';

export const BANK_NAME = 'JT Merlin Bank';
/** The forward-to address a real bank would run next to the page. See /verify. */
export const VERIFY_ADDRESS = 'verify@jtmerlin.com';
