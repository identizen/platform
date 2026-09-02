export interface Device {
  id: string;
  status: 'active' | 'disabled' | 'revoked';
  push_platform: 'apns' | 'fcm' | 'web' | null;
  has_ble: boolean;
  last_seen_at: string | null;
  created_at: string;
  current: boolean;
}

export interface DevicesResponse {
  devices: Device[];
}

export interface RevokeDeviceResponse {
  device_id: string;
  status: string;
  sessions_revoked: number;
}
