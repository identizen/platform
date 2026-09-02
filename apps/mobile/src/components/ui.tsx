/** Primitive, presentational building blocks styled only through the mirrored token classes. */
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
  type PressableProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function Screen({
  children,
  scroll = true,
  testID,
}: {
  children: ReactNode;
  scroll?: boolean;
  testID?: string;
}) {
  const body = <View className="flex-1 gap-4 px-5 pb-8 pt-4">{children}</View>;
  return (
    <SafeAreaView className="flex-1 bg-surface-0 dark:bg-surface-0-dark" testID={testID}>
      {scroll ? <ScrollView keyboardShouldPersistTaps="handled">{body}</ScrollView> : body}
    </SafeAreaView>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  return <Text className="font-semibold text-2xl text-fg dark:text-fg-dark">{children}</Text>;
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

export function Card({ children }: { children: ReactNode }) {
  return (
    <View className="gap-3 rounded-lg border border-border bg-surface-1 p-4 dark:border-border-dark dark:bg-surface-1-dark">
      {children}
    </View>
  );
}

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export interface ButtonProps extends Omit<PressableProps, 'children'> {
  label: string;
  variant?: ButtonVariant;
  busy?: boolean;
}

const variantClass: Record<ButtonVariant, { box: string; text: string }> = {
  primary: {
    box: 'bg-accent dark:bg-accent-dark',
    text: 'text-accent-fg dark:text-accent-fg-dark',
  },
  secondary: {
    box: 'border border-border-strong bg-surface-0 dark:border-border-strong-dark dark:bg-surface-0-dark',
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
  ...rest
}: ButtonProps) {
  const v = variantClass[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled || busy, busy }}
      disabled={!!disabled || busy}
      className={`h-12 flex-row items-center justify-center gap-2 rounded-md px-4 ${v.box} ${disabled || busy ? 'opacity-50' : ''}`}
      {...rest}
    >
      {busy ? <ActivityIndicator /> : null}
      <Text className={`font-semibold text-base ${v.text}`}>{label}</Text>
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
