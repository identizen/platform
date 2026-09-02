import { api } from '@/lib/http';

export interface MeResponse {
  idz: string;
  handle: string | null;
  kind: 'personal' | 'org';
  via: 'device' | 'dashboard';
}

export function getMe(): Promise<MeResponse> {
  return api<MeResponse>('/me');
}

export function setHandle(handle: string | null): Promise<{ idz: string; handle: string | null }> {
  return api('/me/handle', { method: 'POST', body: { handle } });
}
