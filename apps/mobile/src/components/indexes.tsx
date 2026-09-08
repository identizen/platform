/** Presentational bits for the indexes a phone holds an identity on (Settings card, Home chips). */
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { IndexSummary } from '../identity/identity';
import { Badge, Button, Card, ErrorText, Mono, Muted } from './ui';

export function indexHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** `idz_01K3ZB…0000`: enough to tell two identities apart, short enough for a row. */
export function shortIdz(idz: string | null): string {
  if (!idz) return 'not registered';
  return idz.length > 16 ? `${idz.slice(0, 10)}…${idz.slice(-4)}` : idz;
}

/** Home: one chip per index, the active one filled. Shown only when there is more than one. */
export function IndexSwitcher({
  indexes,
  onSelect,
  busy = false,
}: {
  indexes: IndexSummary[];
  onSelect: (indexUrl: string) => void;
  busy?: boolean;
}) {
  return (
    <View className="flex-row flex-wrap gap-2" testID="index-switcher">
      {indexes.map((i) => {
        const host = indexHost(i.indexUrl);
        const on = i.active;
        return (
          <Pressable
            key={i.indexUrl}
            accessibilityRole="button"
            accessibilityLabel={`Use ${host}`}
            accessibilityState={{ selected: on, disabled: busy || !i.registered }}
            disabled={busy || on || !i.registered}
            onPress={() => onSelect(i.indexUrl)}
            testID={`index-chip-${host}`}
            className={`rounded-full border px-3 py-1 ${
              on
                ? 'border-accent bg-accent dark:border-accent-dark dark:bg-accent-dark'
                : 'border-border-strong bg-surface-0 dark:border-border-strong-dark dark:bg-surface-0-dark'
            } ${!i.registered ? 'opacity-50' : ''}`}
          >
            <Text
              className={`font-medium text-xs ${
                on ? 'text-accent-fg dark:text-accent-fg-dark' : 'text-fg dark:text-fg-dark'
              }`}
            >
              {host}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function IndexRow({
  index,
  canForget,
  busy,
  onMakeActive,
  onForget,
}: {
  index: IndexSummary;
  canForget: boolean;
  busy: boolean;
  onMakeActive: () => void;
  onForget: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const host = indexHost(index.indexUrl);
  return (
    <View
      className="gap-2 border-t border-border pt-3 dark:border-border-dark"
      testID={`index-row-${host}`}
      accessibilityLabel={`${host}, ${index.active ? 'active' : index.registered ? 'registered' : 'not registered'}`}
    >
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-1 gap-0.5">
          <Text className="font-medium text-base text-fg dark:text-fg-dark">{host}</Text>
          <Mono>{shortIdz(index.idz)}</Mono>
        </View>
        {index.active ? (
          <Badge label="active" tone="success" />
        ) : index.registered ? null : (
          <Badge label="not registered" tone="warning" />
        )}
      </View>
      <View className="flex-row gap-2">
        {index.registered && !index.active ? (
          <View className="flex-1">
            <Button
              label="Make active"
              variant="secondary"
              onPress={onMakeActive}
              disabled={busy}
              testID={`make-active-${host}`}
            />
          </View>
        ) : null}
        {canForget ? (
          <View className="flex-1">
            {confirm ? (
              <Button
                label="Yes, forget it"
                variant="danger"
                onPress={onForget}
                disabled={busy}
                testID={`forget-index-confirm-${host}`}
              />
            ) : (
              <Button
                label="Forget this index"
                variant="secondary"
                onPress={() => setConfirm(true)}
                disabled={busy}
                testID={`forget-index-${host}`}
              />
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export interface IndexesCardProps {
  indexes: IndexSummary[];
  onMakeActive: (indexUrl: string) => Promise<void>;
  onForgetIndex: (indexUrl: string) => Promise<void>;
  /** Registers the identity on the index; rejects with a message to show. */
  onAddIndex: (url: string) => Promise<void>;
}

/** Settings: every index this phone holds, which one is active, and a way to add one. */
export function IndexesCard(p: IndexesCardProps) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Text className="font-medium text-base text-fg dark:text-fg-dark">Indexes</Text>
      <Muted>
        One recovery phrase, the same identity on every index. The public index is where sites find
        you; an organisation adds its own when you enrol. The active one is what Home and the lists
        show.
      </Muted>
      {p.indexes.map((i) => (
        <IndexRow
          key={i.indexUrl}
          index={i}
          canForget={p.indexes.length > 1}
          busy={busy}
          onMakeActive={() => void run(() => p.onMakeActive(i.indexUrl))}
          onForget={() => void run(() => p.onForgetIndex(i.indexUrl))}
        />
      ))}
      <View className="gap-2 border-t border-border pt-3 dark:border-border-dark">
        <Text className="font-medium text-sm text-fg dark:text-fg-dark">Add an index</Text>
        <TextInput
          accessibilityLabel="Index URL to add"
          testID="add-index-input"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://acme.index.identizen.com"
          value={url}
          onChangeText={setUrl}
          editable={!busy}
          className="h-12 rounded-md border border-border bg-surface-0 px-3 font-mono text-sm text-fg dark:border-border-dark dark:bg-surface-0-dark dark:text-fg-dark"
        />
        {error ? <ErrorText>{error}</ErrorText> : null}
        <Button
          label="Add index"
          variant="secondary"
          busy={busy}
          disabled={url.trim().length === 0}
          onPress={() =>
            void run(async () => {
              await p.onAddIndex(url.trim());
              setUrl('');
            })
          }
          testID="add-index"
        />
      </View>
    </Card>
  );
}
