import { api } from '@/lib/http';
import type { DevicesResponse, RevokeDeviceResponse } from '../types';

export function listDevices(): Promise<DevicesResponse> {
  return api<DevicesResponse>('/me/devices');
}

export function revokeDevice(id: string): Promise<RevokeDeviceResponse> {
  return api<RevokeDeviceResponse>(`/me/devices/${id}/revoke`, { method: 'POST', body: {} });
}
