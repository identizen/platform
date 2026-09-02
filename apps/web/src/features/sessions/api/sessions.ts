import { api } from '@/lib/http';

export interface Session {
  sid: string;
  client_id: string;
  device_id: string;
  created_at: string;
  expires_at: string;
}

export interface SessionsResponse {
  sessions: Session[];
}

export function listSessions(): Promise<SessionsResponse> {
  return api<SessionsResponse>('/me/sessions');
}

export function revokeSession(sid: string): Promise<{ sid: string; revoked_at: string }> {
  return api(`/me/sessions/${sid}/revoke`, { method: 'POST', body: {} });
}
