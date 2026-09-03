/** Primitive, presentational building blocks styled only through the mirrored token classes. */
import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
  type PressableProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBrandColor } from './brand';

export interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  testID?: string;
  /** Title in the top bar. Omit for screens that carry their own brand header. */
  title?: string;
  /** Shows a back chevron in the top bar. */
  onBack?: (() => void) | undefined;
  /** Something rendered at the right end of the top bar. */
  action?: ReactNode;
  /** Pull-to-refresh, scroll screens only. */
  onRefresh?: (() => void) | undefined;
  refreshing?: boolean;
}

/** Top bar: back chevron, title, optional action. Always at the top, never below content. */
export function TopBar({
  title,
  onBack,
  action,
}: {
  title?: string | undefined;
  onBack?: (() => void) | undefined;
  action?: ReactNode;
}) {
  const fg = useBrandColor('fg');
  return (
    <View className="h-12 flex-row items-center px-2" testID="top-bar">
      <View className="w-16 items-start">
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={12}
            onPress={onBack}
            testID="back"
            className="h-10 w-10 items-center justify-center rounded-full active:bg-surface-2 dark:active:bg-surface-2-dark"
          >
            <ChevronLeft color={fg} size={26} strokeWidth={2.25} />
          </Pressable>
        ) : null}
      </View>
      <Text
        numberOfLines={1}
        accessibilityRole="header"
        className="flex-1 text-center font-semibold text-base text-fg dark:text-fg-dark"
      >
        {title ?? ''}
      </Text>
      <View className="w-16 items-end">{action}</View>
    </View>
  );
}

export function Screen({
  children,
  scroll = true,
  testID,
  title,
  onBack,
  action,
  onRefresh,
  refreshing = false,
}: ScreenProps) {
  const accent = useBrandColor('accent');
  const showBar = title !== undefined || onBack !== undefined || action !== undefined;
  const body = <View className="flex-1 gap-4 px-5 pb-8 pt-2">{children}</View>;
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      className="flex-1 bg-surface-0 dark:bg-surface-0-dark"
      testID={testID}
    >
      {showBar ? <TopBar title={title} onBack={onBack} action={action} /> : null}
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />
            ) : undefined
          }
        >
          {body}
        </ScrollView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  return (
    <Text className="font-semibold text-2xl tracking-tight text-fg dark:text-fg-dark">
      {children}
    </Text>
  );
}

/** Small uppercase label above a group, the same voice as the web's section eyebrows. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Text className="font-medium text-xs uppercase tracking-wider text-fg-muted dark:text-fg-muted-dark">
      {children}
    </Text>
  );
}

export function Body({ children, center = false }: { children: ReactNode; center?: boolean }) {
  return (
    <Text
      className={`font-sans text-base leading-6 text-fg dark:text-fg-dark ${center ? 'text-center' : ''}`}
    >
      {children}
    </Text>
  );
}

export function Muted({ children, center = false }: { children: ReactNode; center?: boolean }) {
  return (
    <Text
      className={`font-sans text-sm leading-5 text-fg-muted dark:text-fg-muted-dark ${center ? 'text-center' : ''}`}
    >
      {children}
    </Text>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return (
    <Text className="font-mono text-xs text-fg-muted dark:text-fg-muted-dark">{children}</Text>
  );
}

export function Card({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent';
}) {
  const box =
    tone === 'accent'
      ? 'border-accent/30 bg-accent-soft dark:border-accent-dark/30 dark:bg-accent-soft-dark'
      : 'border-border bg-surface-1 dark:border-border-dark dark:bg-surface-1-dark';
  return <View className={`gap-3 rounded-lg border p-4 ${box}`}>{children}</View>;
}

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export interface ButtonProps extends Omit<PressableProps, 'children'> {
  label: string;
  variant?: ButtonVariant;
  busy?: boolean;
  /** Leading icon, already colored by the caller (use `Button.iconColor`). */
  icon?: ReactNode;
  size?: 'md' | 'lg';
}

const variantClass: Record<ButtonVariant, { box: string; text: string }> = {
  primary: {
    box: 'bg-accent active:bg-accent-hover dark:bg-accent-dark dark:active:bg-accent-hover-dark',
    text: 'text-accent-fg dark:text-accent-fg-dark',
  },
  secondary: {
    box: 'border border-border-strong bg-surface-0 active:bg-surface-1 dark:border-border-strong-dark dark:bg-surface-0-dark dark:active:bg-surface-1-dark',
    text: 'text-fg dark:text-fg-dark',
  },
  danger: { box: 'bg-danger dark:bg-danger-dark', text: 'text-danger-fg dark:text-danger-fg-dark' },
  ghost: { box: 'bg-transparent', text: 'text-accent dark:text-accent-dark' },
};

export function Button({
  label,
  variant = 'primary',
  busy = false,
  disabled,
  icon,
  size = 'md',
  ...rest
}: ButtonProps) {
  const v = variantClass[variant];
  const height = size === 'lg' ? 'h-14 rounded-lg' : 'h-12 rounded-md';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled || busy, busy }}
      disabled={!!disabled || busy}
      className={`flex-row items-center justify-center gap-2 px-4 ${height} ${v.box} ${disabled || busy ? 'opacity-50' : ''}`}
      {...rest}
    >
      {busy ? <ActivityIndicator /> : icon}
      <Text className={`font-semibold ${size === 'lg' ? 'text-lg' : 'text-base'} ${v.text}`}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ListRow({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string | undefined;
  right?: ReactNode;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3 border-b border-border py-3 dark:border-border-dark">
      <View className="flex-1 gap-0.5">
        <Text className="font-medium text-base text-fg dark:text-fg-dark">{title}</Text>
        {subtitle ? (
          <Text className="font-sans text-xs text-fg-muted dark:text-fg-muted-dark">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function Badge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  const tones = {
    neutral: 'bg-surface-2 text-fg-muted dark:bg-surface-2-dark dark:text-fg-muted-dark',
    success:
      'bg-success-soft text-success-soft-fg dark:bg-success-soft-dark dark:text-success-soft-fg-dark',
    warning:
      'bg-warning-soft text-warning-soft-fg dark:bg-warning-soft-dark dark:text-warning-soft-fg-dark',
    danger:
      'bg-danger-soft text-danger-soft-fg dark:bg-danger-soft-dark dark:text-danger-soft-fg-dark',
  };
  return (
    <View className={`rounded-sm px-2 py-0.5 ${tones[tone]}`}>
      <Text className="font-medium text-[11px] uppercase tracking-wide">{label}</Text>
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="alert" className="font-sans text-sm text-danger dark:text-danger-dark">
      {children}
    </Text>
  );
}
