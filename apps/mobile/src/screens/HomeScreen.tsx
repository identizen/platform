import { Pressable, Text, View } from 'react-native';
import type { ActivityEntry, PendingChallenge } from '../challenges/store';
import { Badge, Button, Card, Heading, ListRow, Mono, Muted, Screen } from '../components/ui';

export interface HomeScreenProps {
  idz: string | null;
  handle: string | null;
  indexUrl: string;
  registered: boolean;
  pending: PendingChallenge[];
  activity: ActivityEntry[];
  onOpenChallenge: (id: string) => void;
  onScan: () => void;
  onDevices: () => void;
  onPairings: () => void;
  onSessions: () => void;
  onSettings: () => void;
  onRegister: () => void;
  registering?: boolean;
}

const KIND_TONE: Record<ActivityEntry['kind'], 'neutral' | 'success' | 'warning' | 'danger'> = {
  received: 'neutral',
  approved: 'success',
  denied: 'warning',
  expired: 'neutral',
  failed: 'danger',
};

export function HomeScreen(p: HomeScreenProps) {
  return (
    <Screen testID="home">
      <View className="flex-row items-center justify-between">
        <Heading>Identizen</Heading>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          onPress={p.onSettings}
          testID="open-settings"
        >
          <Text className="font-medium text-base text-accent dark:text-accent-dark">Settings</Text>
        </Pressable>
      </View>

      <Card>
        <Muted>{p.handle ? `@${p.handle}` : 'No handle'}</Muted>
        <Mono>{p.idz ?? 'not registered'}</Mono>
        <Muted>{p.indexUrl}</Muted>
        {!p.registered ? (
          <Button
            label="Register this phone"
            onPress={p.onRegister}
            busy={p.registering ?? false}
            testID="register"
          />
        ) : null}
      </Card>

      {p.pending.length ? (
        <View className="gap-2">
          <Muted>Waiting for you</Muted>
          {p.pending.map((c) => (
            <Pressable
              key={c.challenge.id}
              accessibilityRole="button"
              accessibilityLabel={`Approve ${c.challenge.rp_name}`}
              onPress={() => p.onOpenChallenge(c.challenge.id)}
              testID={`pending-${c.challenge.id}`}
            >
              <Card>
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

      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button label="Scan" onPress={p.onScan} testID="scan" />
        </View>
        <View className="flex-1">
          <Button label="Devices" variant="secondary" onPress={p.onDevices} />
        </View>
      </View>
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button label="Browsers" variant="secondary" onPress={p.onPairings} />
        </View>
        <View className="flex-1">
          <Button label="Sessions" variant="secondary" onPress={p.onSessions} />
        </View>
      </View>

      <Muted>Recent activity</Muted>
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
    </Screen>
  );
}
