import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Badge, Button, ErrorText, Heading, ListRow, Muted, Screen } from '../components/ui';

export interface ListItem {
  id: string;
  title: string;
  subtitle?: string;
  badge?: { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' };
  /** Hide the revoke action (e.g. the current device, an already revoked pairing). */
  revocable: boolean;
}

export interface ListScreenProps {
  heading: string;
  intro: string;
  items: ListItem[];
  loading: boolean;
  error: string | null;
  emptyText: string;
  revokeLabel: string;
  onRevoke: (id: string) => Promise<void>;
  onRefresh: () => void;
  onBack: () => void;
}

/** Devices / paired browsers / sessions share one shape: a list with a two-step revoke. */
export function ListScreen(p: ListScreenProps) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const revoke = async (id: string) => {
    setBusy(id);
    setActionError(null);
    try {
      await p.onRevoke(id);
      setConfirming(null);
    } catch (err) {
      setActionError(String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen testID={`list-${p.heading.toLowerCase().replace(/\s+/g, '-')}`}>
      <Heading>{p.heading}</Heading>
      <Muted>{p.intro}</Muted>
      {p.error ? <ErrorText>{p.error}</ErrorText> : null}
      {actionError ? <ErrorText>{actionError}</ErrorText> : null}
      {p.loading ? <Muted>Loading…</Muted> : null}
      {!p.loading && p.items.length === 0 ? <Muted>{p.emptyText}</Muted> : null}
      {p.items.map((item) => (
        <ListRow
          key={item.id}
          title={item.title}
          subtitle={item.subtitle}
          right={
            <View className="flex-row items-center gap-2">
              {item.badge ? <Badge label={item.badge.label} tone={item.badge.tone} /> : null}
              {item.revocable ? (
                confirming === item.id ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Confirm ${p.revokeLabel} ${item.title}`}
                    onPress={() => void revoke(item.id)}
                    disabled={busy === item.id}
                    testID={`confirm-${item.id}`}
                  >
                    <Text className="font-semibold text-sm text-danger dark:text-danger-dark">
                      {busy === item.id ? '…' : 'Confirm'}
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${p.revokeLabel} ${item.title}`}
                    onPress={() => setConfirming(item.id)}
                    testID={`revoke-${item.id}`}
                  >
                    <Text className="font-medium text-sm text-fg-muted dark:text-fg-muted-dark">
                      {p.revokeLabel}
                    </Text>
                  </Pressable>
                )
              ) : null}
            </View>
          }
        />
      ))}
      <View className="flex-row gap-2 pt-2">
        <View className="flex-1">
          <Button label="Refresh" variant="secondary" onPress={p.onRefresh} />
        </View>
        <View className="flex-1">
          <Button label="Back" variant="ghost" onPress={p.onBack} />
        </View>
      </View>
    </Screen>
  );
}
