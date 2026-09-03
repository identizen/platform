import { Bluetooth, QrCode } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import type { BleStatus } from '../ble/advertiser';
import type { ActivityEntry, PendingChallenge } from '../challenges/store';
import { Lockup, useBrandColor } from '../components/brand';
import { Badge, Button, Card, ListRow, Mono, Muted, Screen, SectionLabel } from '../components/ui';

export interface HomeScreenProps {
  idz: string | null;
  handle: string | null;
  indexUrl: string;
  registered: boolean;
  pending: PendingChallenge[];
  activity: ActivityEntry[];
  onOpenChallenge: (id: string) => void;
  onScan: () => void;
  onRegister: () => void;
  onRefresh?: () => void;
  registering?: boolean;
  bluetooth?: BleStatus;
}

type Tone = 'neutral' | 'success' | 'warning' | 'danger';

/** One line for the identity card: what a nearby computer would see. */
export function bluetoothSummary(b: BleStatus): { label: string; tone: Tone } {
  if (!b.supported) return { label: 'Nearby sign-in needs the native build', tone: 'neutral' };
  if (!b.enabled) return { label: 'Nearby sign-in off', tone: 'neutral' };
  if (b.authorization === 'denied' || b.authorization === 'restricted')
    return { label: 'Bluetooth permission denied', tone: 'danger' };
  if (b.state === 'poweredOff') return { label: 'Bluetooth is off', tone: 'warning' };
  if (b.state === 'unsupported') return { label: 'No Bluetooth on this device', tone: 'neutral' };
  if (b.error) return { label: b.error, tone: 'danger' };
  if (b.advertising) return { label: 'Visible to nearby computers', tone: 'success' };
  return { label: 'Starting Bluetooth…', tone: 'neutral' };
}

const KIND_TONE: Record<ActivityEntry['kind'], Tone> = {
  received: 'neutral',
  approved: 'success',
  denied: 'warning',
  expired: 'neutral',
  failed: 'danger',
};

function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function HomeScreen(p: HomeScreenProps) {
  const accentFg = useBrandColor('paper');
  const muted = useBrandColor('muted');
  return (
    <Screen testID="home" onRefresh={p.onRefresh}>
      <View className="flex-row items-center justify-between pb-1 pt-2">
        <Lockup height={22} />
        {p.registered ? <Badge label="Registered" tone="success" /> : null}
      </View>

      <Card>
        <Text className="font-semibold text-xl text-fg dark:text-fg-dark" testID="home-handle">
          {p.handle ? `@${p.handle}` : 'No handle yet'}
        </Text>
        <Mono>{p.idz ?? 'Not registered'}</Mono>
        <Muted>{host(p.indexUrl)}</Muted>
        {!p.registered ? (
          <Button
            label="Register this phone"
            onPress={p.onRegister}
            busy={p.registering ?? false}
            testID="register"
          />
        ) : null}
        {p.registered && p.bluetooth ? (
          <View className="flex-row items-center justify-between" testID="bluetooth-status">
            <View className="flex-row items-center gap-1.5">
              <Bluetooth size={14} color={muted} />
              <Muted>Nearby</Muted>
            </View>
            <Badge
              label={bluetoothSummary(p.bluetooth).label}
              tone={bluetoothSummary(p.bluetooth).tone}
            />
          </View>
        ) : null}
      </Card>

      {p.pending.length ? (
        <View className="gap-2">
          <SectionLabel>Waiting for you</SectionLabel>
          {p.pending.map((c) => (
            <Pressable
              key={c.challenge.id}
              accessibilityRole="button"
              accessibilityLabel={`Approve ${c.challenge.rp_name}`}
              onPress={() => p.onOpenChallenge(c.challenge.id)}
              testID={`pending-${c.challenge.id}`}
            >
              <Card tone="accent">
                <Text className="font-semibold text-base text-fg dark:text-fg-dark">
                  {c.challenge.rp_name}
                </Text>
                <Muted>
                  {c.challenge.acr === 'idz:mfa' ? 'wants you to confirm' : 'wants to sign you in'}
                </Muted>
              </Card>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Button
        label="Scan a sign-in code"
        size="lg"
        icon={<QrCode size={22} color={accentFg} />}
        onPress={p.onScan}
        testID="scan"
      />

      <View className="gap-1 pt-2">
        <SectionLabel>Recent activity</SectionLabel>
        {p.activity.length === 0 ? (
          <Muted>Nothing yet. Sign in to a site to see it here.</Muted>
        ) : null}
        {p.activity.slice(0, 20).map((a) => (
          <ListRow
            key={`${a.at}-${a.challengeId}-${a.kind}`}
            title={a.rpName}
            subtitle={`${new Date(a.at).toLocaleString()}${a.reason ? ` · ${a.reason}` : ''}`}
            right={<Badge label={a.kind} tone={KIND_TONE[a.kind]} />}
          />
        ))}
      </View>
    </Screen>
  );
}
