/** Presentational pieces for the approve screen and the passphrase flow. */
import { Text, View } from 'react-native';

/** The 2-digit match code, shown big; the browser shows the same code. */
export function MatchCode({ code }: { code: string }) {
  return (
    <View accessibilityLabel={`Match code ${code}`} className="items-center py-4">
      <Text
        className="font-mono text-6xl font-semibold tracking-[0.2em] text-fg dark:text-fg-dark"
        testID="match-code"
      >
        {code}
      </Text>
      <Text className="mt-1 font-sans text-sm text-fg-muted dark:text-fg-muted-dark">
        Make sure your screen shows the same code.
      </Text>
    </View>
  );
}

/** The site-supplied reason for step-up / transaction approvals, verbatim, in its own box. */
export function ReasonBox({ reason }: { reason: string }) {
  return (
    <View
      accessibilityLabel="Reason"
      testID="reason-box"
      className="rounded-md border border-border-strong bg-surface-2 p-4 dark:border-border-strong-dark dark:bg-surface-2-dark"
    >
      <Text className="font-sans text-base leading-6 text-fg dark:text-fg-dark">{reason}</Text>
    </View>
  );
}

/** 24 numbered words. */
export function WordGrid({ words }: { words: string[] }) {
  return (
    <View className="flex-row flex-wrap gap-2" testID="word-grid">
      {words.map((w, i) => (
        <View
          key={`${i}-${w}`}
          className="w-[30%] flex-row items-baseline gap-1 rounded-sm bg-surface-2 px-2 py-1.5 dark:bg-surface-2-dark"
        >
          <Text className="font-mono text-[10px] text-fg-subtle dark:text-fg-subtle-dark">
            {i + 1}
          </Text>
          <Text className="font-mono text-sm text-fg dark:text-fg-dark">{w}</Text>
        </View>
      ))}
    </View>
  );
}
