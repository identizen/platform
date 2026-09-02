import { api } from '@/lib/http';

export interface AuditEvent {
  id: number;
  at: string;
  kind: string;
  device_id: string | null;
  client_id: string | null;
  detail: Record<string, unknown> | null;
}

export interface AuditResponse {
  events: AuditEvent[];
}

export function listAudit(): Promise<AuditResponse> {
  return api<AuditResponse>('/me/audit');
}
