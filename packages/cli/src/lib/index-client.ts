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

export interface VerificationInstructions {
  token: string;
  dns: { name: string; type: 'TXT'; value: string; note: string };
  http: { url: string; body: string };
}

export interface SiteVerification {
  status: 'verified' | 'pending' | 'stale' | 'not_required';
  method: string | null;
  verified_at: string | null;
  instructions?: VerificationInstructions | null;
}

export interface RegisteredSite {
  client_id: string;
  client_secret: string | null;
  webhook_secret: string | null;
  rp_id: string;
  name: string;
  redirect_uris: string[];
  verification?: SiteVerification;
}

/** `POST /sites/{client_id}/verify`: ask the index to look for the published record now. */
export async function verifySite(
  indexUrl: string,
  clientId: string,
  fetchImpl: typeof fetch = (i, init) => fetch(i, init),
): Promise<
  | { ok: true; verification: SiteVerification }
  | { ok: false; error: string; detail: string; instructions: VerificationInstructions | null }
> {
  const base = indexUrl.replace(/\/+$/, '');
  const res = await fetchImpl(`${base}/sites/${clientId}/verify`, { method: 'POST' });
  if (res.ok) {
    const v = (await res.json()) as {
      status: SiteVerification['status'];
      method: string | null;
      verified_at: string | null;
    };
    return {
      ok: true,
      verification: { status: v.status, method: v.method, verified_at: v.verified_at },
    };
  }
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    error_description?: string;
  };
  const current = await fetchImpl(`${base}/sites/${clientId}/verification`);
  const info = current.ok
    ? ((await current.json()) as { instructions: VerificationInstructions | null })
    : { instructions: null };
  return {
    ok: false,
    error: body.error ?? String(res.status),
    detail: body.error_description ?? '',
    instructions: info.instructions,
  };
}

/** Lines telling the registrant what to publish, or [] when nothing is needed. */
export function verificationLines(v: SiteVerification | undefined, clientId: string): string[] {
  if (!v || (v.status !== 'pending' && v.status !== 'stale') || !v.instructions) return [];
  const i = v.instructions;
  return [
    `  This site cannot start logins until ${i.dns.name.replace(/^_identizen\./, '')} proves it is yours. Publish one of:`,
    `    DNS   ${i.dns.name}  TXT  "${i.dns.value}"`,
    `    HTTP  ${i.http.url}  containing  ${i.http.body}`,
    `  then run: npx identizen verify-site --client-id ${clientId}`,
  ];
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
