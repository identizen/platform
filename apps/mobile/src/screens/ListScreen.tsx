import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Badge, ErrorText, Heading, ListRow, Muted, Screen } from '../components/ui';

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
  /** Only for lists pushed on the stack; tab lists have no back. */
  onBack?: () => void;
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
    <Screen
      testID={`list-${p.heading.toLowerCase().replace(/\s+/g, '-')}`}
      onBack={p.onBack}
      onRefresh={p.onRefresh}
      refreshing={p.loading && p.items.length > 0}
    >
      <Heading>{p.heading}</Heading>
      <Muted>{p.intro}</Muted>
      {p.error ? <ErrorText>{p.error}</ErrorText> : null}
      {actionError ? <ErrorText>{actionError}</ErrorText> : null}
      {p.loading && p.items.length === 0 ? <Muted>Loading…</Muted> : null}
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
                    className="rounded-sm bg-danger px-3 py-1.5 dark:bg-danger-dark"
                  >
                    <Text className="font-semibold text-sm text-danger-fg dark:text-danger-fg-dark">
                      {busy === item.id ? '…' : 'Confirm'}
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${p.revokeLabel} ${item.title}`}
                    onPress={() => setConfirming(item.id)}
                    testID={`revoke-${item.id}`}
                    className="rounded-sm border border-border-strong px-3 py-1.5 dark:border-border-strong-dark"
                  >
                    <Text className="font-medium text-sm text-fg dark:text-fg-dark">
                      {p.revokeLabel}
                    </Text>
                  </Pressable>
                )
              ) : null}
            </View>
          }
        />
      ))}
      {p.items.length > 0 ? <Muted center>Pull down to refresh.</Muted> : null}
    </Screen>
  );
}
