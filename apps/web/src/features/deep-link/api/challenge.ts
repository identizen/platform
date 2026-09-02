import { api } from '@/lib/http';

export interface ChallengePayload {
  id: string;
  rp_id: string;
  rp_name: string;
  code: string;
  exp: number;
  acr: 'idz:login' | 'idz:mfa';
  reason: string | null;
}

export interface ChallengeResponse {
  payload: ChallengePayload;
  sig: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
}

export interface ChallengeState {
  challenge_id: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  redirect: string | null;
}

export function getChallenge(id: string): Promise<ChallengeResponse> {
  return api<ChallengeResponse>(`/challenge/${id}`, { anonymous: true });
}

export function getChallengeState(id: string): Promise<ChallengeState> {
  return api<ChallengeState>(`/challenge/${id}/state`, { anonymous: true });
}
