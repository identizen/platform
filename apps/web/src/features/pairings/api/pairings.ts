import { api } from '@/lib/http';

export interface Pairing {
  id: string;
  device_id: string;
  label: string | null;
  browser: string | null;
  browser_version: string | null;
  os: string | null;
  os_version: string | null;
  last_ip: string | null;
  status: 'active' | 'revoked';
  last_used_at: string | null;
  created_at: string;
}

export interface PairingsResponse {
  pairings: Pairing[];
}

export function listPairings(): Promise<PairingsResponse> {
  return api<PairingsResponse>('/me/pairings');
}

export function revokePairing(id: string): Promise<{ id: string; status: string }> {
  return api(`/me/pairings/${id}/revoke`, { method: 'POST', body: {} });
}
