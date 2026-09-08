/**
 * Phone routes of the tenant index (IdentizenEnterprise docs/api/enroll.md, "Phone routes").
 * `begin` is unsigned and goes to the link's index; `claim` and `status` are device-signed, so
 * they run only once this phone is registered on that index (see machine.ts).
 */
import { publicFetch, signedJson, throwIfNotOk } from '../api/client';
import type { Attestation } from '../attestation';
import type { EnrollmentLink } from './links';

export type EnrollmentStatus =
  'pending' | 'claimed' | 'approved' | 'denied' | 'expired' | 'revoked';

export interface EnrollmentInfo {
  org: { display_name: string; logo_url: string | null };
  member_email_masked: string;
  index: string;
  policy: { require_attestation: boolean };
  expires_at: string;
  /** The attestation challenge. Registration still uses `POST /devices/nonce`. */
  nonce: string;
}

export interface ClaimResponse {
  enrollment: { id: string; status: EnrollmentStatus };
  approval_required: boolean;
}

export interface StatusResponse {
  status: EnrollmentStatus;
  approval_required: boolean;
}

export async function beginEnrollment(link: EnrollmentLink): Promise<EnrollmentInfo> {
  const res = await publicFetch(`${link.index}/enroll/${encodeURIComponent(link.token)}/begin`, {
    method: 'POST',
  });
  await throwIfNotOk(res);
  const body = (await res.json()) as Partial<EnrollmentInfo>;
  return {
    org: {
      display_name: body.org?.display_name ?? 'Your organization',
      logo_url: body.org?.logo_url ?? null,
    },
    member_email_masked: body.member_email_masked ?? '',
    index: body.index ?? link.index,
    policy: { require_attestation: body.policy?.require_attestation ?? false },
    expires_at: body.expires_at ?? '',
    nonce: body.nonce ?? '',
  };
}

/** Signed with the device this phone holds on `indexUrl` (the link's index). */
export function claimEnrollmentRequest(
  token: string,
  attestation: Attestation | null,
  indexUrl?: string,
): Promise<ClaimResponse> {
  return signedJson<ClaimResponse>(
    'POST',
    `/enroll/${encodeURIComponent(token)}/claim`,
    attestation ? { attestation } : {},
    indexUrl,
  );
}

export function enrollmentStatusRequest(token: string, indexUrl?: string): Promise<StatusResponse> {
  return signedJson<StatusResponse>(
    'GET',
    `/enroll/${encodeURIComponent(token)}/status`,
    undefined,
    indexUrl,
  );
}
