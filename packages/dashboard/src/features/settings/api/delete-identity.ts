import { api } from '../../../lib/http';

export type DeleteReason = 'deleted' | 'compromised';

export interface DeleteIdentityResponse {
  deleted: true;
  reason: DeleteReason;
  devices: number;
  pairings: number;
  sessions: number;
  bindings: number;
}

/** `DELETE /me`: the identity and everything the index holds about it, in one go. */
export function deleteIdentity(reason: DeleteReason): Promise<DeleteIdentityResponse> {
  return api<DeleteIdentityResponse>('/me', { method: 'DELETE', body: { reason } });
}
