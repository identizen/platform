/**
 * Identizen configuration for the sample site. Registers the site with the local index on
 * first use when no client id is configured (the `identizen dev` experience).
 */

export interface IdentizenConfig {
  indexUrl: string;
  siteUrl: string;
  clientId: string;
  clientSecret: string;
  webhookSecret: string | null;
  discovery: {
    authorization_endpoint: string;
    token_endpoint: string;
    userinfo_endpoint: string;
    jwks_uri: string;
    issuer: string;
  };
}

const g = globalThis as unknown as { __idzConfig?: Promise<IdentizenConfig> };

export function getIdentizen(): Promise<IdentizenConfig> {
  g.__idzConfig ??= load();
  return g.__idzConfig;
}

async function load(): Promise<IdentizenConfig> {
  const indexUrl = (process.env.IDENTIZEN_INDEX_URL ?? 'http://localhost:8787').replace(/\/+$/, '');
  const siteUrl = (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
  const discovery = (await (
    await fetch(`${indexUrl}/.well-known/openid-configuration`)
  ).json()) as IdentizenConfig['discovery'];

  let clientId = process.env.IDENTIZEN_CLIENT_ID;
  let clientSecret = process.env.IDENTIZEN_CLIENT_SECRET;
  let webhookSecret: string | null = process.env.IDENTIZEN_WEBHOOK_SECRET ?? null;
  if (!clientId || !clientSecret) {
    const res = await fetch(`${indexUrl}/sites`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Acme Demo',
        rp_id: new URL(siteUrl).hostname,
        redirect_uris: [`${siteUrl}/api/auth/callback`],
        backchannel_logout_uri: `${siteUrl}/api/auth/backchannel-logout`,
        webhook_url: `${siteUrl}/api/verify/webhook`,
        environment: 'test',
      }),
    });
    if (!res.ok) throw new Error(`site registration failed: ${res.status} ${await res.text()}`);
    const site = (await res.json()) as {
      client_id: string;
      client_secret: string;
      webhook_secret: string | null;
    };
    clientId = site.client_id;
    clientSecret = site.client_secret;
    webhookSecret = site.webhook_secret;
    console.info(`[identizen] registered site ${clientId} with ${indexUrl}`);
  }
  return { indexUrl, siteUrl, clientId, clientSecret, webhookSecret, discovery };
}
