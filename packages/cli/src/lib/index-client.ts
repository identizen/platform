export interface RegisterSiteInput {
  indexUrl: string;
  name: string;
  rpId: string;
  redirectUris: string[];
  backchannelLogoutUri?: string | null;
  webhookUrl?: string | null;
  environment?: 'live' | 'test';
  public?: boolean;
  /** Bearer for hosted indexes with closed registration. */
  registrationToken?: string | null;
  fetchImpl?: typeof fetch;
}

export interface RegisteredSite {
  client_id: string;
  client_secret: string | null;
  webhook_secret: string | null;
  rp_id: string;
  name: string;
  redirect_uris: string[];
}

export async function registerSite(input: RegisterSiteInput): Promise<RegisteredSite> {
  const fetchImpl =
    input.fetchImpl ?? ((i: RequestInfo | URL, init?: RequestInit) => fetch(i, init));
  const res = await fetchImpl(`${input.indexUrl.replace(/\/+$/, '')}/sites`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(input.registrationToken ? { authorization: `Bearer ${input.registrationToken}` } : {}),
    },
    body: JSON.stringify({
      name: input.name,
      rp_id: input.rpId,
      redirect_uris: input.redirectUris,
      backchannel_logout_uri: input.backchannelLogoutUri ?? null,
      webhook_url: input.webhookUrl ?? null,
      environment: input.environment ?? 'test',
      public: input.public ?? false,
    }),
  });
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const body = (await res.json()) as { error?: string; error_description?: string };
      detail = `${body.error ?? res.status}: ${body.error_description ?? ''}`;
    } catch {
      /* non-JSON */
    }
    throw new Error(
      `site registration failed (${detail}). Is the index at ${input.indexUrl} reachable?`,
    );
  }
  return (await res.json()) as RegisteredSite;
}

export async function indexHealthy(
  indexUrl: string,
  fetchImpl: typeof fetch = (i, init) => fetch(i, init),
): Promise<boolean> {
  try {
    const res = await fetchImpl(`${indexUrl.replace(/\/+$/, '')}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
