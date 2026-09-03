/** Container hooks for the three list screens: fetch, map to ListItem, revoke. */
import { useCallback, useEffect, useState } from 'react';
import { api, type DeviceRow, type PairingRow, type SessionRow } from '../api/client';
import type { ListItem } from '../screens/ListScreen';

interface ListState {
  items: ListItem[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

function useList<T>(fetcher: () => Promise<T[]>, map: (row: T) => ListItem): ListState {
  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(() => {
    setLoading(true);
    fetcher()
      .then((rows) => {
        setItems(rows.map(map));
        setError(null);
      })
      .catch((err: unknown) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [fetcher, map]);
  useEffect(() => refresh(), [refresh]);
  return { items, loading, error, refresh };
}

const when = (iso: string | null): string => (iso ? new Date(iso).toLocaleString() : 'never');

export function mapDevice(d: DeviceRow): ListItem {
  return {
    id: d.id,
    title: d.current ? 'This phone' : `Device ${d.id.slice(4, 12)}…`,
    subtitle: `last seen ${when(d.last_seen_at)}${d.has_ble ? ' · Bluetooth' : ''}${d.push_platform ? ` · ${d.push_platform}` : ''}`,
    badge: {
      label: d.status,
      tone: d.status === 'active' ? 'success' : d.status === 'disabled' ? 'warning' : 'danger',
    },
    revocable: d.status === 'active' && !d.current,
  };
}

export function mapPairing(p: PairingRow): ListItem {
  return {
    id: p.id,
    title: p.label ?? 'Paired browser',
    subtitle: `${p.last_ip ? `from ${p.last_ip} · ` : ''}last used ${when(p.last_used_at)}`,
    badge: { label: p.status, tone: p.status === 'active' ? 'success' : 'danger' },
    revocable: p.status === 'active',
  };
}

export function mapSession(s: SessionRow): ListItem {
  return {
    id: s.sid,
    title: s.client_id,
    subtitle: `since ${when(s.created_at)} · expires ${when(s.expires_at)}`,
    revocable: true,
  };
}

export const useDevices = (): ListState => useList(api.devices, mapDevice);
export const usePairings = (): ListState => useList(api.pairings, mapPairing);
export const useSessions = (): ListState => useList(api.sessions, mapSession);
