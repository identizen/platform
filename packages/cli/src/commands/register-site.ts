import { registerSite, type RegisteredSite } from '../lib/index-client.js';

export interface RegisterSiteOptions {
  indexUrl: string;
  name: string;
  rpId: string;
  redirectUris: string[];
  backchannelLogoutUri?: string | null | undefined;
  webhookUrl?: string | null | undefined;
  environment?: 'live' | 'test' | undefined;
  public?: boolean | undefined;
  registrationToken?: string | null | undefined;
  fetchImpl?: typeof fetch | undefined;
}

/** `identizen register-site`: plain registration, prints the credentials once. */
export async function registerSiteCommand(opts: RegisterSiteOptions): Promise<RegisteredSite> {
  return registerSite({
    indexUrl: opts.indexUrl,
    name: opts.name,
    rpId: opts.rpId,
    redirectUris: opts.redirectUris,
    backchannelLogoutUri: opts.backchannelLogoutUri ?? null,
    webhookUrl: opts.webhookUrl ?? null,
    environment: opts.environment ?? 'live',
    public: opts.public ?? false,
    registrationToken: opts.registrationToken ?? null,
    ...(opts.fetchImpl && { fetchImpl: opts.fetchImpl }),
  });
}
