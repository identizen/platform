/**
 * "Advanced: index URL" on the onboarding and restore screens: where a brand-new or restored
 * identity registers first. Collapsed by default, showing the public index.
 */
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { INDEX_URL_HINT, normalizeIndexUrl } from '../enrollment/links';
import { DEFAULT_INDEX_URL } from '../identity/store';
import { useBrandColor } from './brand';
import { ErrorText, Muted } from './ui';

export { DEFAULT_INDEX_URL, INDEX_URL_HINT };

/** The normalized URL, or null (with the hint to show) when the input is not an index address. */
export function validateIndexInput(raw: string): { url: string } | { error: string } {
  const url = normalizeIndexUrl(raw);
  return url ? { url } : { error: INDEX_URL_HINT };
}

export function AdvancedIndexField({
  value,
  onChange,
  error,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string | null | undefined;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(value.trim() !== DEFAULT_INDEX_URL);
  const muted = useBrandColor('muted');
  return (
    <View className="gap-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Advanced: index URL"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        testID="advanced-index"
        className="flex-row items-center gap-1"
      >
        {open ? <ChevronDown size={16} color={muted} /> : <ChevronRight size={16} color={muted} />}
        <Text className="font-sans text-sm text-fg-muted dark:text-fg-muted-dark">
          Advanced: index URL
        </Text>
      </Pressable>
      {open ? (
        <View className="gap-2">
          <TextInput
            accessibilityLabel="Index URL"
            testID="index-url-input"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            value={value}
            onChangeText={onChange}
            editable={!disabled}
            className="h-12 rounded-md border border-border bg-surface-0 px-3 font-mono text-sm text-fg dark:border-border-dark dark:bg-surface-0-dark dark:text-fg-dark"
          />
          {error ? <ErrorText>{error}</ErrorText> : null}
          <Muted>
            Where this identity registers first. Leave the public index unless you run your own; an
            organization&apos;s index is added later by enrolling.
          </Muted>
        </View>
      ) : null}
    </View>
  );
}
